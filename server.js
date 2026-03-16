require("dotenv").config();
const express = require("express");
const { MessagingResponse } = require("twilio").twiml;
const { createClient } = require("@supabase/supabase-js");
const OpenAI = require("openai");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Conexões com as chaves que você configurou no Render
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post("/whatsapp", async (req, res) => {
    const incomingMsg = req.body.Body;
    const sender = req.body.From;
    const twiml = new MessagingResponse();

    try {
        // 1. MEMÓRIA: Recupera as últimas 6 mensagens para não ser repetitivo
        const { data: historico } = await supabase
            .from("historico_messages")
            .select("role, content")
            .eq("phone_number", sender)
            .order("created_at", { ascending: false })
            .limit(6);

        const contextoAnterior = historico?.reverse().map(h => ({
            role: h.role === 'assistant' ? 'assistant' : 'user',
            content: h.content
        })) || [];

        // 2. RACIOCÍNIO TÉCNICO: A IA age como o manual do carro
        const promptIA = [
            { 
                role: "system", 
                content: `Você é o Lubi, consultor técnico sênior da PerfectLub em Ponta Grossa.
                Sua missão é converter a fala do cliente em uma solução técnica.
                
                REGRAS:
                - Se o cliente já disse o carro no histórico, NÃO pergunte de novo.
                - Use seu conhecimento para identificar o óleo (ex: 5W30) e filtros (ar, óleo, combustível) para o carro citado.
                - No campo "busca", coloque apenas termos técnicos (ex: "5W30", "Filtro Onix").
                - Seja vendedor: Sugira sempre a troca de todos os filtros.
                
                Retorne APENAS este JSON:
                {"resposta": "Sua fala técnica e vendedora", "busca": "termo para o banco"}` 
            },
            ...contextoAnterior,
            { role: "user", content: incomingMsg }
        ];

        const aiResponse = await openai.chat.completions.create({
            model: "gpt-4o", // Modelo potente para entender manuais
            messages: promptIA,
            response_format: { type: "json_object" }
        });

        const analise = JSON.parse(aiResponse.choices[0].message.content);

        // 3. CONSULTA NO ESTOQUE: Busca os preços reais dos seus 1.300 itens
        let itensEstoque = "";
        if (analise.busca) {
            const { data: produtos } = await supabase
                .from("produtos")
                .select("descricao, preco")
                .ilike("descricao", `%${analise.busca}%`)
                .limit(4);

            if (produtos?.length > 0) {
                itensEstoque = "\n\n📋 Valores em estoque:\n";
                produtos.forEach(p => {
                    const preco = p.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                    itensEstoque += `▪️ ${p.descricao}: R$ ${preco}\n`;
                });
            }
        }

        const respostaFinal = analise.resposta + itensEstoque;

        // 4. SALVAR HISTÓRICO: Garante que a Lubi aprenda com a conversa
        await supabase.from("historico_messages").insert([
            { phone_number: sender, role: 'user', content: incomingMsg },
            { phone_number: sender, role: 'assistant', content: respostaFinal }
        ]);

        twiml.message(respostaFinal);

    } catch (err) {
        console.error("Erro Técnico:", err);
        twiml.message("Estou consultando nossos manuais técnicos para te dar a resposta exata, um momento...");
    }

    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end(twiml.toString());
});

app.listen(process.env.PORT || 10000);
