export async function performExtraction(
  imageBase64: string,
  pageNumber: number,
  previousContext: string = '',
  pageMemory: Map<number, string> = new Map(),
  enabledQuestionTypes: string[] = ['MCQ', 'MSQ', 'NAT', 'Subjective']
): Promise<ExtractedQuestion[]> {
  const maxRetries = API_KEYS.length;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      const apiKey = API_KEYS[retryCount % API_KEYS.length];
      
      // Store current page context
      const currentContext = `Page ${pageNumber} context`;
      pageMemory.set(pageNumber, currentContext);
      
      // Build context from previous pages
      let contextPrompt = '';
      if (previousContext) {
        contextPrompt = `Previous context: ${previousContext}\n\n`;
      }
      
      // Add memory from recent pages
      const recentPages = Array.from(pageMemory.entries())
        .filter(([page]) => page < pageNumber && page >= pageNumber - 3)
        .map(([page, context]) => `Page ${page}: ${context}`)
        .join('\n');
      
      if (recentPages) {
        contextPrompt += `Recent pages context:\n${recentPages}\n\n`;
      }

      const prompt = `${contextPrompt}You are an expert at extracting questions from exam papers. Extract ALL questions from this image.

CRITICAL RULES:
1. IGNORE general instructions, exam rules, or non-question content
2. Extract ONLY numbered questions (1, 2, 3, etc.) or lettered questions (a, b, c, etc.)
3. Include shared descriptions DIRECTLY in question_statement for each applicable question
4. Include diagram/table descriptions DIRECTLY in question_statement (don't separate them)
5. Convert math to LaTeX: use $ for inline math, $$ for display math
6. Question types available in this paper: ${enabledQuestionTypes.join(', ')}
   - MCQ: Multiple Choice Questions (single correct answer)
   - MSQ: Multiple Select Questions (multiple correct answers)
   - NAT: Numerical Answer Type (numerical value)
   - Subjective: Descriptive/Essay type questions
7. For JSON: Use double backslashes (\\\\) for LaTeX commands, escape quotes as \\"
8. HANDLE IMAGES: If question has diagrams/images that cannot be described in text, mark has_image: true and provide detailed description

WHAT TO IGNORE:
- General exam instructions
- Page headers/footers
- Non-question text
- Instructions that don't relate to specific questions

QUESTION TYPE IDENTIFICATION:
- Look for patterns that indicate question type
- MCQ: Usually has 4 options (A), (B), (C), (D) with single correct answer
- MSQ: Multiple options with instruction like "select all correct" or "one or more correct"
- NAT: Asks for numerical value, no options provided
- Subjective: Descriptive questions asking for explanations, derivations, essays
- ONLY use question types that are enabled: ${enabledQuestionTypes.join(', ')}

JSON FORMAT REQUIREMENTS:
- Use \\\\ for all LaTeX backslashes
- Escape quotes as \\"

Return a JSON array of questions in this exact format:
[
  {
    "question_number": "1",
    "question_statement": "Complete question text with LaTeX math",
    "question_type": "MCQ|MSQ|NAT|Subjective",
    "options": ["A) option text", "B) option text", "C) option text", "D) option text"],
    "has_image": false,
    "image_description": "detailed description if has_image is true",
    "marks": 4,
    "difficulty": "Easy|Medium|Hard",
    "subject": "Physics|Chemistry|Mathematics",
    "topic": "specific topic name"
  }
]

IMPORTANT: Return ONLY the JSON array, no other text.`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: prompt
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/jpeg;base64,${imageBase64}`,
                    detail: 'high'
                  }
                }
              ]
            }
          ],
          max_tokens: 4000,
          temperature: 0.1
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;
      
      // Parse JSON response
      let questions: ExtractedQuestion[];
      try {
        questions = JSON.parse(content);
      } catch (parseError) {
        console.error('Failed to parse JSON response:', content);
        throw new Error('Invalid JSON response from API');
      }

      // Validate and filter questions
      const validQuestions = questions.filter(q => {
        return q.question_number && 
               q.question_statement && 
               enabledQuestionTypes.includes(q.question_type);
      });

      return validQuestions;

    } catch (error) {
      console.error(`Extraction attempt ${retryCount + 1} failed:`, error);
      retryCount++;
      
      if (retryCount >= maxRetries) {
        throw new Error(`All ${maxRetries} extraction attempts failed. Last error: ${error.message}`);
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
    }
  }
  
  return [];
}