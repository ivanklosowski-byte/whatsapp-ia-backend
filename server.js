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
        // 1. MEMÓRIA: Recupera as últimas 10 mensagens para manter o contexto do carro
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

        // 2. IA CONVERSORA TÉCNICA: Traduz "Carro" para "Código de Peça/Viscosidade"
        const aiResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { 
                    role: "system", 
                    content: `Você é o consultor técnico da PerfectLub em Ponta Grossa.
                    Sua função é identificar o carro e converter o pedido em termos de busca para o estoque.

                    REGRAS:
                    - Se o cliente pedir "Troca de Óleo", o "termo_busca" deve ser a viscosidade (ex: '5W30', '10W40').
                    - Se o cliente pedir "Filtro de Óleo", o "termo_busca" deve ser o código da peça ou o modelo do carro (ex: 'PSL55', 'W712', 'Filtro Onix').
                    - Se não souber o carro, "precisa_dados" deve ser true.
                    - Seja educado e técnico (mencione especificações como Dexos 1, API SP, etc).

                    Retorne APENAS JSON:
                    {
                        "resposta_cliente": "Texto explicando a parte técnica para o usuário",
                        "termo_busca": "Código ou viscosidade para o Supabase",
                        "carro_confirmado": "Modelo e Ano",
                        "precisa_dados": false
                    }` 
                },
                ...contextoAnterior,
                { role: "user", content: incomingMsg }
            ],
            response_format: { type: "json_object" }
        });

        const analise = JSON.parse(aiResponse.choices[0].message.content);

        // Se a IA ainda não sabe qual é o carro
        if (analise.precisa_dados) {
            const msgSolicitacao = "Boa tarde! Com certeza. Para eu consultar o estoque e te passar os valores exatos, poderia me informar o modelo, ano e motor do seu carro?";
            twiml.message(msgSolicitacao);
            return res.status(200).send(twiml.toString());
        }

        // 3. BUSCA INTELIGENTE NO BANCO: Busca pelo código técnico gerado pela IA
        const { data: produtos } = await supabase
            .from("produtos")
            .select("descricao, preco")
            .ilike("descricao", `%${analise.termo_busca}%`)
            .limit(5);

        let listaProdutos = "";
        let somaProdutos = 0;
        const maoDeObra = 70.00;

        if (produtos && produtos.length > 0) {
            listaProdutos = "\n\n📋 *Opções em nosso estoque:* \n";
            produtos.forEach(p => {
                listaProdutos += `🔧 ${p.descricao}: R$ ${p.preco.toLocaleString('pt-BR', {minimumFractionDigits: 2})}\n`;
                somaProdutos += p.preco;
            });
        }

        // 4. MONTAGEM DO ORÇAMENTO FINAL
        const totalGeral = (somaProdutos + (somaProdutos > 0 ? maoDeObra : 0)).toLocaleString('pt-BR', {minimumFractionDigits: 2});
        
        let respostaFinal = `Boa tarde! Com certeza, para o seu ${analise.carro_confirmado}, ${analise_cliente.resposta_cliente}\n` +
            `${listaProdutos}` +
            (somaProdutos > 0 ? `🔧 Mão de obra especializada: R$ ${maoDeObra.toLocaleString('pt-BR', {minimumFractionDigits: 2})}\n\n` : "") +
            (somaProdutos > 0 ? `💰 *Total aproximado: R$ ${totalGeral}*` : "\n(Não encontrei este item específico no sistema, mas temos similares na loja!)") +
            `\n\n💡 *Dica:* Recomendo conferir os filtros de ar e combustível também para garantir a economia.\n\n` +
            `Temos horário hoje na PerfectLub em Ponta Grossa. Vamos agendar?`;

        // 5. SALVAMENTO NO HISTÓRICO
        await supabase.from("historico_messages").insert([
            { phone_number: sender, role: 'user', content: incomingMsg },
            { phone_number: sender, role: 'assistant', content: respostaFinal }
        ]);

        twiml.message(respostaFinal);

    } catch (err) {
        console.error(err);
        twiml.message("Estou verificando os códigos técnicos para o seu veículo no manual, um momento...");
    }

    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end(twiml.toString());
});

app.listen(process.env.PORT || 10000);
