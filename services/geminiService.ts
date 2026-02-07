
import { GoogleGenAI, Type } from "@google/genai";
import { ReportData } from '../types';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable is not set.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

// Schema for the data to be extracted by the AI.
const reportSchema = {
  type: Type.OBJECT,
  properties: {
    tipoMovimiento: { 
    type: Type.STRING, 
    description: "Identify the type of movement located in the bottom section of the document, specifically the bold heading immediately above the 'FECHA:' field. Expected values are: 'Toma de posesión efectiva', 'No toma de posesión', 'Prórroga de toma de posesión', or 'Toma de posesión con solicitud de lic. mayor jerarquía (Art. 20 G)'. Extract the exact text found in that position." 
},
    expediente: { type: Type.STRING, description: "Extract the 'Número de Expediente' located in the bottom section of the document. It is positioned directly below the 'FECHA' field (e.g., 10/02/2026). It typically starts with 'E.E.' followed by a number and year (e.g., 'E.E. 7381240/2026 ESC200866'). You must include the alphanumeric code that follows the year (e.g., 'E.E. 7381240/2025 ESC200866'). Do NOT use the 'N° DE EE. DE LA NORMA' found in the middle of the document." },
    fecha: { type: Type.STRING, description: "Extract the date located in the bottom section of the document. Use the value found immediately after the label 'FECHA:' (e.g., 10/02/2026). This date is positioned directly above the 'E.E.' expediente number. Do NOT use the 'Impreso' date at the top or any other dates from the middle of the form." },
    /* motivoDeCese: { type: Type.STRING, description: "The reason for cessation, from 'MOTIVO DE CESE' in section '5. CESE'. This should ONLY be populated if 'FECHA DE CESE' has a date." }, */
    /* reemplazaA: { type: Type.STRING, description: "The person being replaced. This should ONLY be populated if 'FECHA DE CESE' is empty. Combine name, CUIL, and reason from 'DOCENTE INTERINO'/'TITULAR'." }, */
    cuil: { type: Type.STRING, description: "The CUIL of the teacher ('DOCENTE TITULAR'). Look for it near the name in 'DOCENTE TITULAR'" },
    rol: { type: Type.STRING, description: "The role of the teacher. Its value depends on the logic path." },
    apellidoYNombre: { type: Type.STRING, description: "Full name of the teacher ('DOCENTE TITULAR'). Look for 'APELLIDO Y NOMBRE' under 'DOCENTE TITULAR'" },
    situacionDeRevista: { type: Type.STRING, description: 'The situation of the teacher. Always set to "2" (Titular).' },
    cargoACubrir: { type: Type.STRING, description: "A detailed job description. Combine 'CARGO A CUBRIR', 'ASIGNATURA', 'CANTIDAD DE HORAS CÁTEDRA A CUBRIR', 'AÑO / DIV / COM / NIV', and 'Turno'. Formatting rules are critical: after the hours value (e.g., '2.00'), append ' hs'. For the 'AÑO / DIV' part (e.g., '2 / 1 / /'), format it as '2° 1°'. The final string must be a clean, comma-separated list, e.g., 'PROFESOR DE EDUCACIÓN MEDIA, EDUCACIÓN TECNOLÓGICA, 2.00 hs, 2° 1° Turno Tarde'." },
    cc: { type: Type.STRING, description: "The 'Código de Cargo' calculated based on the starting words of 'cargoACubrir'." },
    concurso: { type: Type.STRING, description: "The 'Concurso' value extracted from the document." },
    resolucion: { type: Type.STRING, description: "The value from 'N° DE RESOLUCION DE ALTA'. Format: NNNN-YYYY-GCABA-XXXXX." }
  },
  required: [
    "expediente", "fecha", "cuil", "rol", "apellidoYNombre", "situacionDeRevista", "cargoACubrir", "cc", "concurso", "resolucion"
  ]
};


export const extractDataFromDocumentText = async (text: string): Promise<ReportData> => {
  const prompt = `
    Analyze the following OCR text from a document about a teacher appointment in Argentina.
    Extract ONLY the information required by the provided schema and return it as a JSON object.

    **Definitions for clarity:**
    *   **Expediente**: Extract the 'Número de Expediente' located in the bottom section of the document. It is positioned directly below the 'FECHA' field (e.g., 10/02/2026). It typically starts with 'E.E.' followed by a number and year (e.g., 'E.E. 7381240/2026 ESC200866'). You must include the alphanumeric code that follows the year (e.g., 'E.E. 7381240/2025 ESC200866'). Do NOT use the 'N° DE EE. DE LA NORMA' found in the middle of the document.'.

    **Primary Logic Path:**
        *   **tipoMovimiento**: Identify the type of movement located in the bottom section of the document, specifically the bold heading immediately above the 'FECHA:' field. Expected values are: 'Toma de posesión efectiva', 'No toma de posesión', 'Prórroga de toma de posesión', or 'Toma de posesión con solicitud de lic. mayor jerarquía (Art. 20 G)'. Extract the exact text found in that position.'.
        *   **expediente**: Use the 'Expediente de Alta' (e.g., 'E.E. 7381240/2025 ESC200866').
        *   **fecha**: Extract the date located in the bottom section of the document. Use the value found immediately after the label 'FECHA:' (e.g., 10/02/2026). This date is positioned directly above the 'E.E.' expediente number. Do NOT use the 'Impreso' date at the top or any other dates from the middle of the form.'.
        *   **rol**: Look for a value next to 'Rol:'. If it is missing or empty, return the exact string "".

    **Other extraction rules (apply in both cases unless overridden above):**
    *   **Situación de revista**: '2'.
    *   **CUIL**: Extract the CUIL of the teacher from the 'DOCENTE TITULAR' section. It is typically located near the name and may be labeled as 'CUIL' after the name.
    *  **Apellido y Nombre**: Extract the full name of the teacher from the 'DOCENTE TITULAR' section. Look for the label 'APELLIDO Y NOMBRE' under 'DOCENTE TITULAR'.
    *   **Concurso**: Extract the 'Concurso' value from the document. It is typically labeled as 'CONCURSO' and may be found in the middle section of the form.
    *   **Resolución**: Extract the value from 'N° DE RESOLUCION DE ALTA'. It is typically labeled as 'N° DE RESOLUCION DE ALTA' formatted as NNNN-YYYY-GCABA-XXXXX and can be found in the middle section of the document.
    *   **Cargo a cubrir**: Create a single, clean, comma-separated string following these exact formatting rules:
        a. Start with the value from 'CARGO A CUBRIR'.
        b. If 'ASIGNATURA' has a value, append it.
        c. **Conditional Logic**: If 'HORAS CÁTEDRA A CUBRIR' has a numeric value **greater than 0** (e.g., '2.00'):
            i. Append the numeric value followed immediately by ' hs'. For example, '2.00' becomes '2.00 hs'.
            ii. After appending the hours, check for 'AÑO / DIV / COM / NIV'. If it has values like '2 / 1 / /', format and append it as '2° 1°'. Use the degree symbol (°).
            **IMPORTANT: The 'AÑO / DIV / COM / NIV' part should ONLY be added if 'HORAS CÁTEDRA A CUBRIR' has a value greater than 0.**
        d. Append the 'Turno' value at the very end.
        e. The final string must not include any field labels. Example (with hours): 'PROFESOR DE EDUCACIÓN MEDIA, EDUCACIÓN TECNOLÓGICA, 2.00 hs, 2° 1° Turno Tarde'. Example (without hours): 'MAESTRO DE MATERIAS ESPECIALES TECNOLOGÍAS, DISEÑO Y PROGRAMACIÓN (EDUCACIÓN SUPERIOR) Turno TARDE'.
    *   **CC**: **CRITICAL: This field must be calculated immediately after 'cargoACubrir' is constructed.** Use the following logic based on the start of the final 'cargoACubrir' string (Case-Insensitive):
        i. If **'cargoACubrir'** begins with **"MAESTRO DE SECCION"**, the **cc** value is **"847"**.
        ii. If **'cargoACubrir'** begins with **"MAESTRO AUXILIAR"**, the **cc** value is **"889"**.
        iii. If **'cargoACubrir'** begins with **"MAESTRO DE GRADO"**, the **cc** value is **"845"**.
        iv. If **'cargoACubrir'** begins with **"AYUDANTE DE CLASES"**, the **cc** value is **"1567"**.
        v. If **'cargoACubrir'** begins with **"TP1"**, the **cc** value is **"1507"**.
        vi. If **'cargoACubrir'** begins with **"TP2"**, the **cc** value is **"1528"**.
        vii. If **'cargoACubrir'** begins with **"TP3"**, the **cc** value is **"1549"**.
        viii. If **'cargoACubrir'** begins with **"TP4"**, the **cc** value is **"1550"**.
        ix. If **'cargoACubrir'** begins with **"TC"**, the **cc** value is **"1504"**.
        x. If **'cargoACubrir'** begins with **"VICEDIRECTOR"**, the **cc** value is **"1517"**.
        xi. If **'cargoACubrir'** begins with **"PRECEPTOR"**, the **cc** value is **"1582"**.
        xii. If **'cargoACubrir'** begins with **"PROFESOR DE EDUCA"**, the **cc** value is **"1599"**.
        xiii. For all other cases, the **cc** value must be an empty string **""**.


    Here is the document text:
    ---
    ${text}
    ---
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: reportSchema,
      },
    });

    const jsonText = response.text.trim();
    const parsedData = JSON.parse(jsonText);
    
    const finalData: ReportData = {
      ...parsedData,
      establecimiento: "E.N.S. 2 EN L.VIVAS M. ACOSTA",
      telefono: "49317981",
      delegacion: "III",
      reparticion: "3511",
    };

    return finalData;

  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new Error("Fallo al procesar el documento.");
  }
};
