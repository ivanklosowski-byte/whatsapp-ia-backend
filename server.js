require("dotenv").config();
const express = require("express");
const { MessagingResponse } = require("twilio").twiml;
const { createClient } = require("@supabase/supabase-js");
const OpenAI = require("openai");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 10000;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post("/whatsapp", async (req, res) => {
    const incomingMsg = req.body.Body;
    const sender = req.body.From; // O número do WhatsApp do cliente
    const twiml = new MessagingResponse();

    try {
        // 1. BUSCAR OU CRIAR CONTEXTO DO CLIENTE
        let { data: contexto } = await supabase
            .from("clientes_contexto")
            .select("*")
            .eq("telefone", sender)
            .single();

        if (!contexto) {
            const { data: novoContexto } = await supabase
                .from("clientes_contexto")
                .upsert({ telefone: sender })
                .select()
                .single();
            contexto = novoContexto;
        }

        // 2. USAR IA PARA ENTENDER A INTENÇÃO E EXTRAIR DADOS
        const promptIA = `
            Você é a Lubi, consultora da PerfectLub. 
            Mensagem do cliente: "${incomingMsg}"
            Contexto atual do carro do cliente: "${contexto.carro || "Desconhecido"}"
            
            Tarefa: 
            1. Identifique se o cliente informou um novo carro (Marca, Modelo, Ano, Motor).
            2. Identifique se ele quer saber preço de óleo ou filtros.
            3. Responda em JSON: {"carro_identificado": "string ou null", "intencao": "orcamento|duvida", "assunto": "oleo|filtros|outro"}
        `;

        const aiResponse = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: "system", content: promptIA }],
            response_format: { type: "json_object" }
        });

        const analise = JSON.parse(aiResponse.choices[0].message.content);

        // 3. ATUALIZAR CONTEXTO SE UM CARRO FOI IDENTIFICADO
        if (analise.carro_identificado) {
            await supabase
                .from("clientes_contexto")
                .update({ carro: analise.carro_identificado, ultimo_assunto: analise.assunto })
                .eq("telefone", sender);
            contexto.carro = analise.carro_identificado;
        }

        // 4. LÓGICA DE RESPOSTA
        if (!contexto.carro && !analise.carro_identificado) {
            twiml.message("Olá! Para te passar o orçamento correto, qual o modelo, ano e motor do seu veículo?");
        } else {
            // BUSCAR PRODUTOS NO BANCO USANDO O CONTEXTO
            const buscaCriterio = analise.assunto === "oleo" ? "oleo" : incomingMsg;
            
            const { data: produtos } = await supabase
                .from("produtos")
                .select("descricao, preco")
                .ilike("descricao", `%${buscaCriterio}%`)
                .limit(3);

            if (produtos && produtos.length > 0) {
                let resposta = `Para o seu ${contexto.carro}, encontrei:\n\n`;
                produtos.forEach(p => {
                    const precoBR = p.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                    resposta += `🔧 ${p.descricao}\n💰 R$ ${precoBR}\n\n`;
                });
                twiml.message(resposta);
            } else {
                twiml.message(`Entendi que é para um ${contexto.carro}. Vou verificar a disponibilidade dessas peças e já te retorno!`);
            }
        }

    } catch (err) {
        console.error("Erro Geral:", err);
        twiml.message("Ops, tive um probleminha técnico. Pode repetir?");
    }

    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end(twiml.toString());
});

app.listen(PORT, () => console.log(`Lubi PerfectLub ativa na porta ${PORT} ✅`));
