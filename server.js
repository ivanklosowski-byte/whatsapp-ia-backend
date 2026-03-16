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
        // 1. RECUPERA TODO O HISTÓRICO RECENTE (A memória do especialista)
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

        // 2. O PROMPT DO ESPECIALISTA (Onde a mágica acontece)
        const mensagensParaIA = [
            { 
                role: "system", 
                content: `Você é o Lubi, o consultor técnico sênior da PerfectLub em Ponta Grossa. 
                Sua missão é dar orçamentos precisos de troca de óleo e filtros.

                DIRETRIZES DE ESPECIALISTA:
                - NÃO SEJA REPETITIVO. Se o cliente já disse o carro, NUNCA pergunte de novo.
                - SEJA TÉCNICO: Se o cliente falar "Onix 1.0", você sabe que o óleo é 5W30 Dexos 1. Use isso para buscar no banco.
                - BUSCA NO BANCO: Extraia o termo técnico (ex: "5W30", "Filtro Onix", "PSL55") para pesquisar na planilha de produtos.
                - SE FALTA INFO: Se ele não disse o motor ou ano, peça de forma natural, ex: "Para o Onix temos dois tipos de filtro, qual o ano do seu?"

                Retorne APENAS um JSON:
                {
                  "termo_busca": "termo para o SQL ilike",
                  "resposta_cliente": "Sua resposta técnica e direta",
                  "carro_detectado": "Modelo/Ano/Motor"
                }` 
            },
            ...memoriaConversa,
            { role: "user", content: incomingMsg }
        ];

        const aiResponse = await openai.chat.completions.create({
            model: "gpt-4o", // O modelo mais inteligente para evitar repetições
            messages: mensagensParaIA,
            response_format: { type: "json_object" }
        });

        const analise = JSON.parse(aiResponse.choices[0].message.content);

        // 3. BUSCA DINÂMICA NO SEU ESTOQUE (1.300+ itens)
        let produtosResposta = "";
        if (analise.termo_busca) {
            const { data: produtos } = await supabase
                .from("produtos")
                .select("descricao, preco")
                .ilike("descricao", `%${analise.termo_busca}%`)
                .limit(3);

            if (produtos?.length > 0) {
                produtosResposta = "\n\n📋 Opções em estoque:\n";
                produtos.forEach(p => {
                    produtosResposta += `▪️ ${p.descricao}: R$ ${p.preco.toLocaleString('pt-BR', {minimumFractionDigits: 2})}\n`;
                });
            }
        }

        const respostaFinal = analise.resposta_cliente + produtosResposta;

        // 4. SALVAR HISTÓRICO (Essencial para não repetir perguntas)
        await supabase.from("historico_messages").insert([
            { phone_number: sender, role: 'user', content: incomingMsg },
            { phone_number: sender, role: 'assistant', content: respostaFinal }
        ]);

        twiml.message(respostaFinal);

    } catch (err) {
        console.error(err);
        twiml.message("Estou consultando nossos manuais técnicos, um momento...");
    }

    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end(twiml.toString());
});

app.listen(process.env.PORT || 10000);
