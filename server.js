require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const twilio = require("twilio");
const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// CONFIGURAÇÃO DAS APIS (Pega das variáveis de ambiente do Render)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

app.post("/webhook", async (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();
  const numCliente = req.body.From;
  const mensagemUsuario = req.body.Body;

  try {
    // 1. BUSCAR HISTÓRICO NO SUPABASE (Memória)
    const { data: mensagensAntigas } = await supabase
      .from("historico_mensagens")
      .select("role, content")
      .eq("phone_number", numCliente)
      .order("created_at", { ascending: true })
      .limit(10);

    // 2. PERSONALIDADE "BLINDADA" DO ESPECIALISTA EM ÓLEO
    const promptEspecialista = `
      Você é o 'LubriBot', o especialista técnico da PerfectLub. 
      Sua função é atender clientes interessados em TROCA DE ÓLEO e FILTROS.

      REGRAS DE OURO:
      - Se o cliente perguntar o "preço" de um carro (ex: Camaro), entenda que ele quer saber o PREÇO DO SERVIÇO DE TROCA DE ÓLEO para aquele veículo. NUNCA fale sobre o valor de venda do carro.
      - Para qualquer veículo, pergunte sempre: Modelo, Ano e Motorização (ex: 1.0, 2.0, V8).
      - Explique que carros modernos exigem óleo sintético e que a troca do filtro é obrigatória para manter a garantia do serviço.
      - Seja educado, use emojis como 🛢️, 🚗 e 🔧.
      - Se o cliente perguntar o valor, diga que os preços variam conforme a marca do óleo (Mobil, Castrol, etc) e peça um momento para você confirmar o valor exato no balcão.
    `;

    // 3. MONTAR O CONTEXTO PARA A OPENAI
    const messages = [
      { role: "system", content: promptEspecialista },
      ...(mensagensAntigas || []),
      { role: "user", content: mensagemUsuario }
    ];

    // 4. CHAMAR A IA (GPT-4o-mini é o melhor custo-benefício)
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      temperature: 0.5, // Menor temperatura = menos chance de "inventar" coisas
      max_tokens: 400
    });

    const respostaIA = completion.choices[0].message.content;

    // 5. SALVAR NO BANCO DE DADOS (Pergunta e Resposta)
    await supabase.from("historico_mensagens").insert([
      { phone_number: numCliente, role: "user", content: mensagemUsuario },
      { phone_number: numCliente, role: "assistant", content: respostaIA }
    ]);

    // 6. ENVIAR RESPOSTA PARA O WHATSAPP
    twiml.message(respostaIA);

  } catch (error) {
    console.error("Erro Crítico:", error);
    twiml.message("Ops! Tive um pequeno problema técnico. Pode repetir sua pergunta
