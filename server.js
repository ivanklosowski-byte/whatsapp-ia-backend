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
    // BUSCA MEMÓRIA NO BANCO
    let { data: historico } = await supabase
      .from("historico_mensagens")
      .select("role, content")
      .eq("phone_number", numCliente)
      .order("created_at", { ascending: true })
      .limit(8);

    const messages = [
      { role: "system", content: "Você é o LubriBot, especialista da PerfectLub. Seu foco é troca de óleo. Se o cliente falar Camaro 2011, você já sabe que usa óleo 5W30 Sintético (7.6 litros). Seja direto e use emojis." },
      ...(historico || []).map(m => ({ role: m.role, content: m.content })),
      { role: "user", content: mensagemUsuario }
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages
    });

    const resposta = completion.choices[0].message.content;

    // SALVA NA MEMÓRIA
    await supabase.from("historico_mensagens").insert([
      { phone_number: numCliente, role: "user", content: mensagemUsuario },
      { phone_number: numCliente, role: "assistant", content: resposta }
    ]);

    twiml.message(resposta);
  } catch (e) {
    twiml.message("Oi! Aqui é da PerfectLub. Como posso ajudar com seu carro?");
  }

  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(twiml.toString());
});

app.listen(process.env.PORT || 3000, () => console.log("PerfectLub Ativa!"));
