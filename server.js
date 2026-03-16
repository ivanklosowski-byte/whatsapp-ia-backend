require("dotenv").config();
const express = require("express");
const { MessagingResponse } = require("twilio").twiml;
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 10000;

// Conexão Supabase com as chaves que você configurou
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

app.post("/whatsapp", async (req, res) => {
  const incomingMsg = req.body.Body.toLowerCase();
  const twiml = new MessagingResponse();

  try {
    // Buscar produto parecido na sua tabela de produtos
    const { data, error } = await supabase
      .from("produtos")
      .select("descricao, preco")
      .ilike("descricao", `%${incomingMsg}%`)
      .limit(3);

    if (error) throw error;

    if (data.length === 0) {
      twiml.message(
        "Não encontrei esse produto no sistema. Pode enviar mais detalhes?"
      );
    } else {
      let resposta = "Encontrei estes produtos:\n\n";

      data.forEach((produto) => {
        // Formata o preço para o padrão brasileiro (vírgula)
        const precoFormatado = produto.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        resposta += `${produto.descricao}\n💰 R$ ${precoFormatado}\n\n`;
      });

      twiml.message(resposta);
    }

  } catch (err) {
    console.error(err);
    twiml.message("Erro ao consultar o sistema.");
  }

  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(twiml.toString());
});

app.listen(PORT, () => {
  console.log("Servidor PerfectLub rodando ✅");
});
