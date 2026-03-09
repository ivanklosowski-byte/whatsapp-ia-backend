require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const twilio = require("twilio");
const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

app.post("/webhook", async (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();
  const numCliente = req.body.From;
  const mensagemUsuario = req.body.Body;

  try {
    // 1. BUSCAR HISTÓRICO NO SUPABASE
    const { data: mensagensAntigas } = await supabase
      .from("historico_mensagens")
      .select("role, content")
      .eq("phone_number", numCliente)
      .order("created_at", { ascending: true })
      .limit(10);

    // 2. DEFINIR A PERSONALIDADE DO BOT (O JAVASCRIPT QUE VOCÊ PERGUNTOU)
    const promptEspecialista = `
      Você é o 'LubriBot', o especialista técnico da sua loja de óleos e filtros.
      Sua missão é ajudar motoristas e mecânicos.
      
      Regras:
      - Sempre pergunte o Modelo, Ano e Motor do carro para indicar o óleo correto.
      - Se o cliente pedir óleo, sugira trocar o filtro de óleo também 🔧.
      - Seja educado e use emojis como 🛢️ e 🚗.
      - Se não souber o preço de algo, peça para o cliente aguardar um instante que um consultor humano vai confirmar o estoque.
    `;

    // 3. MONTAR O ARRAY DE MENSAGENS PARA A OPENAI
    const messages = [
      { role: "system", content: promptEspecialista }, // Personalidade aqui
      ...(mensagensAntigas || []),                   // Memória aqui
      { role: "user", content: mensagemUsuario }      // Pergunta atual
    ];

    // 4. CHAMAR A IA
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      temperature: 0.7
    });

    const respostaIA = completion.choices[0].message.content;

    // 5. SALVAR NO BANCO DE DADOS
    await supabase.from("historico_mensagens").insert([
      { phone_number: numCliente, role: "user", content: mensagemUsuario },
      { phone_number: numCliente, role: "assistant", content: respostaIA }
    ]);

    twiml.message(respostaIA);

  } catch (error) {
    console.error("Erro:", error);
    twiml.message("Ops, tive um probleminha. Pode repetir?");
  }

  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(twiml.toString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 LubriBot rodando na porta ${PORT}`));
