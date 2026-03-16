require("dotenv").config();
const express = require("express");
const { MessagingResponse } = require("twilio").twiml;
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 10000;

// conexão Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

app.post("/whatsapp", async (req, res) => {
  const incomingMsg = req.body.Body.toLowerCase();
  const twiml = new MessagingResponse();

  try {

    // buscar produto parecido
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
        resposta += `${produto.descricao}\n💰 R$ ${produto.preco}\n\n`;
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
