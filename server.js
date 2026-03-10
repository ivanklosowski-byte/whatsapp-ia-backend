const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function pesquisarDadosTecnicos(carroCliente) {
    // Aqui a IA age como um consultor técnico pesquisando no "Google"
    const prompt = `Atue como um mecânico especialista da PerfectLub. 
    O cliente tem um: ${carroCliente}. 
    Responda APENAS em formato JSON com:
    {
      "litros": quantidade_decimal,
      "viscosidade": "ex_5W30",
      "filtro_referencia": "codigo_comum_filtro"
    }
    Pesquise em manuais e fóruns técnicos.`;

    const response = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview", // Modelo que consegue "pensar" melhor tecnicamente
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
    });

    return JSON.parse(response.choices[0].message.content);
}
