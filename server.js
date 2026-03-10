require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { MessagingResponse } = require('twilio').twiml;

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// 1. CONEXÃO AJUSTADA PARA O SEU PRINT
// Note que usamos SUPABASE_ANON_KEY para bater com o que você salvou no Render
const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_ANON_KEY
);

// ... (Aqui fica o seu catálogo técnico de Onix, Astra, etc que mandei antes)

// 2. ROTA DE TESTE (Para você ver se o bot está vivo)
app.get('/', (req, res) => res.send('PerfectLub Online!'));

app.post('/whatsapp', async (req, res) => {
    const msgCliente = req.body.Body || "";
    const twiml = new MessagingResponse();
    
    // Chame aqui sua função de orçamento...
    // const resposta = await gerarOrcamento(msgCliente);
    // twiml.message(resposta);

    res.type('text/xml').send(twiml.toString());
});

// 3. VÍNCULO COM A PORTA (O Render vai ler o valor que você salvou lá)
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Servidor PerfectLub rodando na porta ${PORT}`);
});
