require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const twilio = require("twilio");
const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// 1. CONEXÃO COM OS SERVIÇOS (Pegando do Environment do Render)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

app.post("/webhook", async (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();
  const numCliente = req.body.From;
  const mensagemUsuario = req.body.Body;

  try {
    // 2. BUSCAR HISTÓRICO NO SUPABASE (Memória do Cliente)
    let { data: mensagensAntigas } = await supabase
      .from("historico_mensagens")
      .select("role, content")
      .eq("phone_number", numCliente)
      .order("created_at", { ascending: true })
      .limit(10);

    // 3. PERSONALIDADE DO ESPECIALISTA PERFECTLUB
    const promptEspecialista = `
      Você é o LubriBot, o especialista técnico da PerfectLub Centro Automotivo.
      Seu foco principal é TROCA DE ÓLEO E FILTROS.
      
      REGRAS DE OURO:
      - Se o cliente já disse o veículo (ex: Camaro 2011), use essa informação para não perguntar de novo.
      - Camaro 2011 V8: Usa óleo 5W30 Sintético (capacidade aprox. 7.6 litros). 
      - Sempre ofereça a troca do filtro de óleo em conjunto com o lubrificante.
      - Use emojis para ser amigável: 🛢️, 🚗, 🔧, ✅.
      - Seu objetivo é converter a conversa em um agendamento de serviço.
    `;

    // 4. PREPARAR MENSAGENS PARA A IA
    const messages = [
      { role: "system", content: promptEspecialista },
      ...(mensagensAntigas || []).map(m => ({ role: m.role, content: m.content })),
      { role: "user", content: mensagemUsuario }
    ];

    // 5. CHAMADA PARA A OPENAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      temperature: 0.3
    });

    const respostaIA = completion.choices[0].message.content;

    // 6. SALVAR A CONVERSA NO BANCO (Para ele lembrar depois)
    await supabase.from("historico_mensagens").insert([
      { phone_number: numCliente, role: "user", content: mensagemUsuario },
      { phone_number: numCliente, role: "assistant", content: respostaIA }
    ]);

    // 7. RESPONDER AO WHATSAPP
    twiml.message(respostaIA);

  } catch (error) {
    console.error("Erro no sistema:", error);
    twiml.message("Olá! Tive um breve problema técnico aqui na PerfectLub. Poderia repetir sua dúvida?");
  }

  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(twiml.toString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 LubriBot PerfectLub Online e com Memória!"));
