require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const twilio = require("twilio");
const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// CONFIGURAÇÃO DOS SERVIÇOS
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

app.post("/webhook", async (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();
  const numCliente = req.body.From;
  const mensagemUsuario = req.body.Body;

  try {
    // 1. BUSCA HISTÓRICO NO SUPABASE (MEMÓRIA)
    let { data: historico } = await supabase
      .from("historico_mensagens")
      .select("role, content")
      .eq("phone_number", numCliente)
      .order("created_at", { ascending: true })
      .limit(10);

    // 2. O NOVO CÉREBRO DO LUBRIBOT (FOCO EM CUSTO-BENEFÍCIO)
    const promptEspecialista = `
      Você é o LubriBot, o especialista técnico da PerfectLub Centro Automotivo. 
      Sua missão é vender serviços de troca de óleo com o melhor CUSTO-BENEFÍCIO.

      MARCAS DE ÓLEO QUE TRABALHAMOS:
      - Lubrax (Principal recomendação para custo-benefício)
      - Shell e Petronas (Linha Premium)
      - Motorcraft (Recomendado para veículos Ford)
      - Total (Excelente para diversas aplicações)

      FILTROS:
      - Trabalhamos exclusivamente com filtros WEGA e TECFIL (linha de montagem).

      REGRAS DE OURO:
      - NÃO oferecemos mais a marca Motul. Focamos em Lubrax, Shell e Petronas.
      - Nunca sugira procurar outra oficina. Você é a solução para o cliente.
      - Para o Camaro 2011: Use óleo 5W30 (Petronas ou Shell) - Kit com 7.6L + Filtro por R$ 850,00.
      - Sempre tente fechar o agendamento: "Podemos reservar um horário para você hoje ou prefere amanhã?"
      - Se não tiver o preço exato de um carro, peça o modelo e motorização (1.0, 1.6, etc).

      RECURSOS TÉCNICOS:
      - Use emojis: 🛢️, 🚗, 🔧, ✅, 💨.
    `;

    // 3. MONTAGEM DO CONTEXTO PARA A IA
    const messages = [
      { role: "system", content: promptEspecialista },
      ...(historico || []).map(m => ({ role: m.role, content: m.content })),
      { role: "user", content: mensagemUsuario }
    ];

    // 4. CHAMADA DA IA (MODELO RÁPIDO E EFICIENTE)
    const completion =
