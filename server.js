require("dotenv").config();
const express = require("express");
const { MessagingResponse } = require("twilio").twiml;
const { createClient } = require("@supabase/supabase-js");
const OpenAI = require("openai");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post("/whatsapp", async (req, res) => {
    const incomingMsg = req.body.Body;
    const sender = req.body.From;
    const twiml = new MessagingResponse();

    try {
        // 1. MEMÓRIA: Puxa o histórico (Onix 2013)
        const { data: historico } = await supabase
            .from("historico_messages")
            .select("role, content")
            .eq("phone_number", sender)
            .order("created_at", { ascending: false })
            .limit(10);

        const contextoAnterior = historico?.reverse().map(h => ({
            role: h.role === 'assistant' ? 'assistant' : 'user',
            content: h.content
        })) || [];

        // 2. IA TÉCNICA: Extrai apenas o que precisamos buscar
        const aiResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { 
                    role: "system", 
                    content: `Você é um mecânico especialista da PerfectLub. 
                    Analise a conversa e retorne APENAS um JSON com:
                    "termo_busca": (ex: '5W30' ou 'Filtro Onix'),
                    "info_tecnica": (ex: 'o manual exige óleo 5W30 Dexos 1, 3.5 litros'),
                    "carro": (ex: 'Onix 1.0 2013'),
                    "precisa_pedir_dados": (true se não souber o carro ainda)` 
                },
                ...contextoAnterior,
                { role: "user", content: incomingMsg }
            ],
            response_format: { type: "json_object" }
        });

        const analise = JSON.parse(aiResponse.choices[0].message.content);

        if (analise.precisa_pedir_dados) {
            const msgFaltaDados = "Boa tarde! Com certeza, para eu te passar o valor exato agora, poderia me dizer o modelo, motor e ano do seu carro?";
            twiml.message(msgFaltaDados);
            return res.status(200).send(twiml.toString());
        }

        // 3. BUSCA NO BANCO: Agora buscamos os produtos ANTES de montar a resposta
        const { data: produtos } = await supabase
            .from("produtos")
            .select("descricao, preco")
            .ilike("descricao", `%${analise.termo_busca}%`)
            .limit(4);

        let listaProdutosTexto = "";
        let somaTotal = 70.00; // Mão de obra fixa

        if (produtos && produtos.length > 0) {
            produtos.forEach(p => {
                listaProdutosTexto += `🔧 ${p.descricao}: R$ ${p.preco.toLocaleString('pt-BR', {minimumFractionDigits: 2})}\n`;
                somaTotal += p.preco;
            });
        }

        // 4. MONTAGEM DO ORÇAMENTO (O modelo que você aprovou)
        const respostaFinal = `Boa tarde! Com certeza, para o seu ${analise.carro}, ${analise.info_tecnica}.\n\n` +
            `Fiz um levantamento aqui no nosso estoque agora e os valores ficam assim:\n` +
            `${listaProdutosTexto}` +
            `🔧 Mão de obra especializada: R$ 70,00\n\n` +
            `*Total aproximado: R$ ${somaTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}*\n\n` +
            `*Dica de especialista:* Além do óleo, recomendo verificarmos também os filtros de combustível e ar do motor para manter o consumo baixo.\n\n` +
            `Temos horário livre para essa tarde aqui na oficina em Ponta Grossa. Vamos agendar?`;

        // 5. SALVA NO HISTÓRICO
        await supabase.from("historico_messages").insert([
            { phone_number: sender, role: 'user', content: incomingMsg },
            { phone_number: sender, role: 'assistant', content: respostaFinal }
        ]);

        twiml.message(respostaFinal);

    } catch (err) {
        console.error(err);
        twiml.message("Boa tarde! Poderia me confirmar o modelo e ano do seu carro para eu calcular o valor?");
    }

    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end(twiml.toString());
});

app.listen(process.env.PORT || 10000);
