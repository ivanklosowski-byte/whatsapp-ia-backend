require("dotenv").config();
const express = require("express");
const { MessagingResponse } = require("twilio").twiml;
const { createClient } = require("@supabase/supabase-js");
const OpenAI = require("openai");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Validação das chaves (evita o erro que deu no Render)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const openaiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !supabaseKey || !openaiKey) {
    console.error("❌ ERRO: Verifique as Variáveis de Ambiente no Render!");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiKey });

app.post("/whatsapp", async (req, res) => {
    const incomingMsg = req.body.Body;
    const sender = req.body.From;
    const twiml = new MessagingResponse();

    try {
        // 1. MEMÓRIA: Busca o histórico real da sua tabela 'historico_messages'
        const { data: historico } = await supabase
            .from("historico_messages")
            .select("role, content")
            .eq("phone_number", sender)
            .order("created_at", { ascending: false })
            .limit(8);

        const contextoAnterior = historico?.reverse().map(h => ({
            role: h.role === 'assistant' ? 'assistant' : 'user',
            content: h.content
        })) || [];

        // 2. CÉREBRO TÉCNICO: A IA decide o que buscar e o que responder
        const promptIA = [
            { 
                role: "system", 
                content: `Você é o Lubi, consultor técnico da PerfectLub. 
                Sua base de conhecimento são manuais de veículos.
                
                REGRAS:
                - Se o cliente informou o carro no histórico, NÃO PERGUNTE DE NOVO.
                - Se ele quer óleo, identifique a viscosidade (ex: 5W30) para o motor dele.
                - Se ele quer filtro, identifique o tipo.
                - Use o campo 'termo_busca' para palavras que existam na sua planilha de 1300 produtos.
                
                Retorne APENAS JSON:
                {
                  "termo_busca": "ex: 5W30 ou Filtro Onix",
                  "resposta_cliente": "Sua resposta técnica e amigável"
                }` 
            },
            ...contextoAnterior,
            { role: "user", content: incomingMsg }
        ];

        const aiResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: promptIA,
            response_format: { type: "json_object" }
        });

        const analise = JSON.parse(aiResponse.choices[0].message.content);

        // 3. ESTOQUE: Busca na sua tabela real de 'produtos'
        let listaProdutos = "";
        if (analise.termo_busca) {
            const { data: produtos } = await supabase
                .from("produtos")
                .select("descricao, preco")
                .ilike("descricao", `%${analise.termo_busca}%`)
                .limit(3);

            if (produtos?.length > 0) {
                listaProdutos = "\n\n📍 Temos em estoque:\n";
                produtos.forEach(p => {
                    const preco = p.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                    listaProdutos += `▪️ ${p.descricao}: R$ ${preco}\n`;
                });
            }
        }

        const respostaFinal = analise.resposta_cliente + listaProdutos;

        // 4. LOG: Salva a conversa para a próxima interação ser mais inteligente
        await supabase.from("historico_messages").insert([
            { phone_number: sender, role: 'user', content: incomingMsg },
            { phone_number: sender, role: 'assistant', content: respostaFinal }
        ]);

        twiml.message(respostaFinal);

    } catch (err) {
        console.error("Erro na execução:", err);
        twiml.message("Estou verificando a disponibilidade no sistema, só um momento...");
    }

    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end(twiml.toString());
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`PerfectLub Online ✅`));
