require("dotenv").config();
const express = require("express");
const { MessagingResponse } = require("twilio").twiml;
const OpenAI = require("openai");
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 10000;

// Conexão com o seu Supabase (usando as chaves que já estão no seu Render)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

/**
 * Busca técnica no banco de dados 'produtos'
 */
async function consultarBanco(termo) {
  // Fazemos uma busca ampla para pegar óleo, filtros e peças
  const { data, error } = await supabase
    .from('produtos')
    .select('produto, preco')
    .ilike('produto', `%${termo}%`)
    .limit(15); // Aumentei o limite para trazer opções de marcas

  if (error) {
    console.error("❌ Erro Supabase:", error.message);
    return [];
  }
  return data;
}

async function responderIA(msg, nome) {
  if (!openai) return null;

  // 1. Extração do termo de busca (Carro ou Peça)
  const extracao = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: "Extraia o nome do carro ou peça para busca em banco de dados. Ex: 'Onix', 'Vela Wega', 'Filtro Tecfil'. Responda apenas o termo principal." }, { role: "user", content: msg }],
    max_tokens: 20
  });

  const termo = extracao.choices[0].message.content;
  const dadosProdutos = await consultarBanco(termo);

  // 2. Resposta Final baseada na sua Tabela Real
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `Você é o Lubi, Consultor Técnico da PerfectLub em Ponta Grossa.
        
        DADOS REAIS DA TABELA 'PRODUTOS':
        ${JSON.stringify(dadosProdutos)}
        
        SUAS REGRAS:
        1. Se houver dados acima, informe o nome exato do produto e o preço.
        2. Se o cliente pedir óleo, mostre as opções de viscosidade e marcas (Wega, Tecfil, Petronas, etc) que apareceram na busca.
        3. Informe que a MÃO DE OBRA para troca de óleo e filtros é um valor fixo (consulte a política da loja).
        4. Se não encontrar o carro exato, peça o modelo/ano e diga que vai olhar no catálogo físico.
        5. Seja educado, use o nome ${nome} e convide para o agendamento.`
      },
      { role: "user", content: msg }
    ],
    max_tokens: 350,
    temperature: 0 // Zero criatividade, 100% fidelidade aos dados
  });

  return response.choices[0].message.content;
}

app.get("/", (req, res) => res.send("🚀 Lubi PerfectLub conectado ao Supabase!"));

app.post("/whatsapp", async (req, res) => {
  const twiml = new MessagingResponse();
  const mensagem = req.body.Body || "";
  const nomeCliente = req.body.PushName || "amigo";

  const texto = mensagem.toLowerCase().trim();
  const saudacoes = ["oi", "ola", "olá", "bom dia", "boa tarde", "boa noite", "opa"];

  try {
    if (saudacoes.includes(texto)) {
      twiml.message(`Olá ${nomeCliente}! 👋\n\nSou o *Lubi*, seu consultor na *PerfectLub*. Me diga o carro ou a peça que você procura e eu consulto nossa tabela agora!`);
    } else {
      const respostaIA = await responderIA(mensagem, nomeCliente);
      twiml.message(respostaIA);
    }
  } catch (erro) {
    console.error(erro);
    twiml.message(`Opa, estou consultando o catálogo aqui... já te respondo!`);
  }

  res.type("text/xml").send(twiml.toString());
});

app.listen(PORT, () => console.log("🚀 Sistema Operacional!"));
