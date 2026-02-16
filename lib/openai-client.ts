import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function runJsonModel(prompt: string, maxOutputTokens = 10000) {
  const res = await openai.responses.create({
    model: "gpt-5.2",
    temperature: 0,
    max_output_tokens: maxOutputTokens,
    text: { format: { type: "json_object" } },
    input: prompt
  });

  const text = res.output_text;
  if (text == null || text === "") {
    const err = (res as { error?: { message?: string } }).error;
    throw new Error(err?.message ?? "Model returned no output");
  }
  return text;
}