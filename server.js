require("dotenv").config();
const express = require("express");
const { MessagingResponse } = require("twilio").twiml;
const { createClient } = require("@supabase/supabase-js");
const OpenAI = require("openai");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post("/whatsapp", async (req, res) => {
    const incomingMsg = req.body.Body;
    const sender = req.body.From;
    const twiml = new MessagingResponse();

    try {
        // 1. Recupera o histórico para ter memória (evita repetir perguntas)
        const { data: historico } = await supabase
            .from("historico_messages")
            .select("role, content")
            .eq("phone_number", sender)
            .order("created_at", { ascending: false })
            .limit(10);

        const memoriaConversa = historico?.reverse().map(h => ({
            role: h.role,
            content: h.content
        })) || [];

        // 2. Prompt do Especialista
        const mensagensParaIA = [
            { 
                role: "system", 
                content: `Você é o Lubi, consultor técnico sênior da PerfectLub. 
                Sua missão é dar orçamentos precisos de troca de óleo e filtros.
                DIRETRIZES:
                - NÃO REPITA PERGUNTAS. Se o histórico já tem o carro, não pergunte de novo.
                - SEJA TÉCNICO: Converta o carro do cliente em termos de busca (ex: 5W30, Filtro Onix).
                - Use um tom profissional e prestativo de Ponta Grossa.
                Retorne JSON: {"termo_busca": "string", "resposta_cliente": "string"}` 
            },
            ...memoriaConversa,
            { role: "user", content: incomingMsg }
        ];

        const aiResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: mensagensParaIA,
            response_format: { type: "json_object" }
        });

        const analise = JSON.parse(aiResponse.choices[0].message.content);

        // 3. Busca no seu estoque de 1.300 itens
        let produtosExtras = "";
        if (analise.termo_busca) {
            const { data: produtos } = await supabase
                .from("produtos")
                .select("descricao, preco")
                .ilike("descricao", `%${analise.termo_busca}%`)
                .limit(3);

            if (produtos?.length > 0) {
                produtosExtras = "\n\n📋 Opções em estoque:\n";
                produtos.forEach(p => {
                    const valor = p.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                    produtosExtras += `▪️ ${p.descricao}: R$ ${valor}\n`;
                });
            }
        }

        const respostaFinal = analise.resposta_cliente + produtosExtras;

        // 4. Salva no histórico
        await supabase.from("historico_messages").insert([
            { phone_number: sender, role: 'user', content: incomingMsg },
            { phone_number: sender, role: 'assistant', content: respostaFinal }
        ]);

        twiml.message(respostaFinal);

    } catch (err) {
        console.error("Erro interno:", err);
        twiml.message("Estou verificando nossos manuais técnicos, um momento...");
    }

    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end(twiml.toString());
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Servidor PerfectLub ativo na porta ${PORT} ✅`);
});
