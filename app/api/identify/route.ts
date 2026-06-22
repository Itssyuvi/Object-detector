import { generateText, Output } from 'ai'
import { z } from 'zod'

// Allow extra time for the vision model to analyze the frame.
export const maxDuration = 30

const ResultSchema = z.object({
  items: z
    .array(
      z.object({
        object: z.string().describe('The common name of the object, e.g. "sneaker", "laptop", "soda can"'),
        brand: z
          .string()
          .describe(
            'The brand or manufacturer if clearly identifiable from logos, text, or distinctive design. Use "Unknown" if it cannot be determined.',
          ),
        detail: z
          .string()
          .describe('A short note: model, color, or any visible text/label. Keep under 12 words.'),
        confidence: z
          .number()
          .describe('Your confidence from 0 to 1 that the brand is correct.'),
      }),
    )
    .describe('Distinct physical objects visible in the image.'),
})

export async function POST(req: Request) {
  try {
    const { image } = (await req.json()) as { image?: string }

    if (!image || !image.startsWith('data:image')) {
      return Response.json(
        { error: 'A base64 image data URL is required.' },
        { status: 400 },
      )
    }

    const { experimental_output } = await generateText({
      model: 'google/gemini-3.5-flash',
      system:
        'You are a precise visual product identifier. Examine the image and list each distinct ' +
        'physical object. For each, give its common name and, when a logo, label, or unmistakable ' +
        'design reveals it, the brand. Never guess a brand without visual evidence — use "Unknown" instead. ' +
        'Ignore background clutter, walls, and people unless they are the clear subject.',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Identify the objects and their brands in this image.',
            },
            { type: 'image', image },
          ],
        },
      ],
      experimental_output: Output.object({ schema: ResultSchema }),
    })

    return Response.json(experimental_output)
  } catch (err) {
    console.log('[v0] identify error:', err)
    const raw = err instanceof Error ? err.message : String(err)

    // Common case in v0: the AI Gateway needs billing enabled.
    if (/credit card|billing|payment|quota|insufficient/i.test(raw)) {
      return Response.json(
        {
          error:
            'AI brand identification needs the Vercel AI Gateway enabled. Add a credit card to your Vercel account to unlock free credits, then try again.',
        },
        { status: 402 },
      )
    }

    return Response.json(
      { error: 'Failed to analyze the image. Please try again.' },
      { status: 500 },
    )
  }
}
