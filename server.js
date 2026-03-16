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
        // 1. MEMÓRIA: Carrega o histórico para saber o carro e o que já foi dito
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

        // 2. IA CONSULTORA: Gera a resposta técnica e o termo de busca
        const promptIA = [
            { 
                role: "system", 
                content: `Você é a Lubi, consultora técnica sênior da PerfectLub em Ponta Grossa.
                Sua missão é vender a troca completa (Óleo + Todos os Filtros).

                ESTILO DE RESPOSTA:
                - Use o tom: "Boa tarde! Com certeza, para o seu [Carro], o manual exige o óleo [Viscosidade]..."
                - Informe detalhes técnicos (ex: Dexos 1 para Onix, quantidade de litros).
                - Sugira sempre verificar filtros de AR e COMBUSTÍVEL para economia de combustível.
                - Termine sempre convidando para agendar na oficina em Ponta Grossa.
                
                Retorne APENAS JSON:
                {"termo_busca": "termo para o estoque", "intro_tecnica": "Sua explicação inicial", "sugestao_venda": "Sua dica de especialista"}
                ` 
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

        // 3. BUSCA NO ESTOQUE: Puxa os preços reais
        let listaProdutos = "";
        let totalProdutos = 0;
        const maoDeObra = 70.00;

        if (analise.termo_busca) {
            const { data: produtos } = await supabase
                .from("produtos")
                .select("descricao, preco")
                .ilike("descricao", `%${analise.termo_busca}%`)
                .limit(4);

            if (produtos?.length > 0) {
                listaProdutos = "\n\nFiz um levantamento aqui no nosso estoque agora:\n";
                produtos.forEach(p => {
                    const preco = p.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                    listaProdutos += `🔧 ${p.descricao}: R$ ${preco}\n`;
                    totalProdutos += p.preco;
                });
                listaProdutos += `🔧 Mão de obra especializada: R$ ${maoDeObra.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
                
                const totalGeral = (totalProdutos + maoDeObra).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                listaProdutos += `\n💰 *Total aproximado: R$ ${totalGeral}*`;
            }
        }

        // 4. MONTAGEM DA RESPOSTA FINAL (IGUAL AO QUE VOCÊ PEDIU)
        const respostaFinal = `${analise.intro_tecnica}${listaProdutos}\n\n💡 *Dica de especialista:* ${analise.sugestao_venda}\n\nTemos horário livre para essa tarde aqui na oficina em Ponta Grossa. Vamos agendar?`;

        // 5. SALVA NO BANCO
        await supabase.from("historico_messages").insert([
            { phone_number: sender, role: 'user', content: incomingMsg },
            { phone_number: sender, role: 'assistant', content: respostaFinal }
        ]);

        twiml.message(respostaFinal);

    } catch (err) {
        console.error(err);
        twiml.message("Boa tarde! Estou consultando a ficha técnica do seu veículo e nossa tabela de preços, um momento...");
    }

    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end(twiml.toString());
});

app.listen(process.env.PORT || 10000);
