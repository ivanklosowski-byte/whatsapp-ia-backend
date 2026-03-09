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

// FUNÇÃO DE BUSCA NA PLANILHA
async function buscarNaPlanilha(termo) {
  try {
    const { data, error } = await supabase
      .from('produtos')
      .select('Descricao, "Preco Vista"')
      .ilike('Descricao', `%${termo}%`)
      .limit(3);
    
    if (data && data.length > 0) {
      return data.map(p => `- ${p.Descricao}: R$ ${p['Preco Vista']}`).join('\n');
    }
    return null;
  } catch (e) { return null; }
}

app.post("/webhook", async (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();
  const numCliente = req.body.From;
  const mensagemUsuario = req.body.Body;

  try {
    // 1. Busca histórico e tenta encontrar preço na planilha
    let { data: historico } = await supabase.from("historico_mensagens").select("role, content").eq("phone_number", numCliente).order("created_at", { ascending: true }).limit(5);
    const precosEncontrados = await buscarNaPlanilha(mensagemUsuario);

    // 2. Prompt com os dados da sua planilha
    const promptEspecialista = `
      Você é o LubriBot da PerfectLub. 
      MARCAS: Lubrax, Shell, Petronas, Motorcraft e Total. Filtros Wega/Tecfil.
      
      DADOS DA PLANILHA (Use se for relevante):
      ${precosEncontrados ? precosEncontrados : "Nenhum produto específico encontrado na busca rápida."}
      
      DIRETRIZES:
      - Se o preço acima for relevante, informe-o ao cliente.
      - Se for troca de óleo, adicione a Mão de Obra (R$ 60,00 conforme sua tabela).
      - Foque no custo-benefício e tente agendar o serviço.
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: promptEspecialista },
        ...(historico || []).map(m => ({ role: m.role, content: m.content })),
        { role: "user", content: mensagemUsuario }
      ],
      temperature: 0.5
    });

    const respostaIA = completion.choices[0].message.content;

    await supabase.from("historico_mensagens").insert([
      { phone_number: numCliente, role: "user", content: mensagemUsuario },
      { phone_number: numCliente, role: "assistant", content: respostaIA }
    ]);

    twiml.message(respostaIA);
  } catch (error) {
    twiml.message("Olá! Tivemos um pequeno erro, mas a equipe da PerfectLub já vai te atender! 🚗");
  }
  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(twiml.toString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 LubriBot conectado à Planilha de Valores!"));
