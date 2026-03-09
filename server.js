require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const { Configuration, OpenAIApi } = require("openai");
const twilio = require("twilio");

const app = express();
app.use(bodyParser.json());

const openai = new OpenAIApi(new Configuration({
    apiKey: process.env.OPENAI_API_KEY
}));

const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);

app.post("/webhook", async (req, res) => {
    const incomingMsg = req.body.Body;
    const fromNumber = req.body.From;

    try {
        const response = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: [{role: "user", content: incomingMsg}],
        });

        const aiText = response.data.choices[0].message.content;

        await twilioClient.messages.create({
            from: process.env.TWILIO_NUMBER,
            to: fromNumber,
            body: aiText
        });

        res.sendStatus(200);
    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
