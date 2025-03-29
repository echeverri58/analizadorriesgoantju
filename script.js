// ##############################################################
// #  ADVERTENCIA DE SEGURIDAD EXTREMADAMENTE IMPORTANTE        #
// ##############################################################
// INCORPORAR LA API KEY AQUÍ ES MUY INSEGURO. CUALQUIERA PUEDE VERLA.
// ÚSALO SOLO PARA PRUEBAS ESTRICTAMENTE LOCALES Y PERSONALES.
// NO SUBAS ESTE CÓDIGO A NINGÚN SERVIDOR PÚBLICO O COMPARTIDO.
// Considera seriamente usar un backend para manejar la API Key.
const GOOGLE_API_KEY = "AIzaSyA3p6lGcZz7hfYtjILfUec2Oi6knai8i8k"; // <--- ¡¡¡REEMPLAZA ESTO CON TU CLAVE!!! (INSEGURO)

// Define aquí las instrucciones estándar que SIEMPRE se usarán para el análisis.
// Modifica este texto para cambiar el tipo de análisis que realiza la IA.
const ANALYSIS_INSTRUCTIONS = `
Eres un abogado experto en el tema de riesgo antijuridico y quiero que analices documentos de instituciones publicas del Estado Colombiano y en base a la legislacion Colombiana evalues los riesgos antijuridicos que puede tener el documento proporcionado y ademas si detecta riesgos crear una ruta de prevencion de estos y otra ruta de defensa por medio de nuestros abogados expertos, revisa toda la documentación posible sobre el riesgo antijuridico con la cual se entreno como agente.

**Formato:**
Utiliza encabezados de Markdown (#, ##) como se muestra arriba para estructurar tu respuesta.
Separa los párrafos con una línea en blanco.
Usa **negrita** para resaltar los títulos de las secciones o términos muy importantes dentro del texto.
Tu análisis debe basarse estrictamente en la información contenida en el documento proporcionado. No añadas información externa ni hagas suposiciones. 
`;
// ##############################################################

// Referencias a elementos del DOM (ya no necesitamos apiKeyInput ni userPromptInput)
const pdfFileInput = document.getElementById('pdfFile');
const analyzeButton = document.getElementById('analyzeButton');
const statusDiv = document.getElementById('status');
const resultSection = document.getElementById('resultSection');
const downloadLink = document.getElementById('downloadLink');

// Acceder a jsPDF
const { jsPDF } = window.jspdf;

// --- Función para mostrar mensajes de estado ---
function showStatus(message, type = 'info') {
    statusDiv.className = 'status-section';
    statusDiv.classList.add(`status-${type}`);
    statusDiv.innerHTML = message;
    statusDiv.style.display = 'block';
}

// --- Función para leer texto del PDF (sin cambios) ---
async function extractPdfText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const typedArray = new Uint8Array(event.target.result);
                const loadingTask = pdfjsLib.getDocument({ data: typedArray });
                const pdf = await loadingTask.promise;
                let fullText = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(' ');
                    fullText += pageText + '\n\n';
                }
                resolve(fullText.trim());
            } catch (error) {
                console.error("Error al leer PDF con pdf.js:", error);
                reject(`Error al procesar el archivo PDF: ${error.message || error}`);
            }
        };
        reader.onerror = (error) => {
            console.error("Error de FileReader:", error);
            reject("Error al leer el archivo localmente.");
        };
        reader.readAsArrayBuffer(file);
    });
}

// --- Función para llamar a la API de Gemini (Modificada: usa constante API Key) ---
// Ya no necesita 'apiKey' como argumento
async function callGeminiAPI(prompt, pdfText) {
    // Verifica si la API Key fue insertada (simple chequeo)
    if (!GOOGLE_API_KEY || GOOGLE_API_KEY === "AQUI_PEGA_TU_GOOGLE_API_KEY") {
        throw new Error("Error de configuración: La Google API Key no ha sido definida en script.js.");
    }

    const model = 'gemini-1.5-flash';
    // Usa la constante GOOGLE_API_KEY directamente en la URL
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GOOGLE_API_KEY}`;

    const requestBody = {
        contents: [{
            parts: [{
                text: `
                **Instrucciones (Predefinidas):**
                ${prompt}

                **Texto del Documento PDF para Analizar:**
                --- INICIO DEL DOCUMENTO ---
                ${pdfText}
                --- FIN DEL DOCUMENTO ---

                **Tarea:**
                Sigue las instrucciones predefinidas para analizar el texto proporcionado y genera la respuesta estructurada como se solicitó.
                `
            }]
        }],
        generationConfig: {
           temperature: 0.6,
           maxOutputTokens: 4096,
         },
    };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            let errorData;
            try { errorData = await response.json(); } catch (e) { throw new Error(`Error de red o API (${response.status}): ${response.statusText}`); }
            console.error("Error API:", errorData);
            const apiErrorMessage = errorData.error?.message || JSON.stringify(errorData.error);
            // Detecta explícitamente error de API Key inválida
            if (response.status === 400 && apiErrorMessage.toLowerCase().includes("api key not valid")) {
                 throw new Error("Error de API: La clave proporcionada no es válida. Verifica la constante GOOGLE_API_KEY en script.js.");
            }
            throw new Error(`Error de la API (${response.status}): ${apiErrorMessage}`);
        }

        const data = await response.json();

        if (data.candidates && data.candidates.length > 0 && data.candidates[0].content?.parts?.[0]?.text) {
            return data.candidates[0].content.parts[0].text;
        } else if (data.promptFeedback?.blockReason) {
             const blockReason = data.promptFeedback.blockReason;
             console.warn(`Contenido bloqueado: ${blockReason}`);
             throw new Error(`La solicitud fue bloqueada por la API por razones de seguridad (${blockReason}).`);
        } else {
            console.warn("Respuesta inesperada de la API:", data);
            throw new Error("La API devolvió una respuesta válida pero en un formato inesperado o vacío.");
        }

    } catch (error) {
        console.error("Error detallado al llamar a la API de Gemini:", error);
        // Simplifica el mensaje de error para el usuario si es posible
         if (error.message.includes("API key not valid") || error.message.includes("API Key not valid")) {
             throw new Error("Error de Configuración: La Google API Key definida en script.js no es válida.");
         } else if (error.message.includes("quota")) {
             throw new Error("Error: Se ha excedido la cuota de uso de la API. Inténtalo más tarde.");
         } else if (error.message.includes("NetworkError") || error.message.includes("Failed to fetch")) {
             throw new Error("Error de Red: No se pudo conectar con la API de Google. Verifica tu conexión a internet.");
         }
        throw error; // Re-lanza otros errores
    }
}


// --- Función para generar PDF con jsPDF (sin cambios respecto a la versión anterior con formato) ---
function generatePdfWithFooter(analysisText, footerText = "Grupo de Analisis Antijuridico - Alberto Grisales") {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

    const margin = 20;
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const usableWidth = pageWidth - 2 * margin;
    const footerStartY = pageHeight - margin + 5;
    const contentEndY = pageHeight - margin - 5;

    const FONT_NORMAL = "helvetica";
    const STYLE_NORMAL = "normal";
    const STYLE_BOLD = "bold";
    const SIZE_H1 = 16; const SIZE_H2 = 14; const SIZE_H3 = 12.5;
    const SIZE_NORMAL = 11; const SIZE_FOOTER = 8;
    const SPACE_AFTER_H1 = 6; const SPACE_AFTER_H2 = 5; const SPACE_AFTER_H3 = 4;
    const SPACE_AFTER_P = 3; const LINE_SPACING_FACTOR = 1.3;

    let currentPage = 1; let y = margin;

    const addFooter = (pageNumber) => { /* ... (código del footer sin cambios) ... */
        const previousSize = doc.getFontSize();
        const previousStyle = doc.getFont().fontStyle;
        const previousColor = doc.getTextColor();
        doc.setFontSize(SIZE_FOOTER);
        doc.setFont(FONT_NORMAL, STYLE_NORMAL);
        doc.setTextColor(100); // Gris
        doc.text(footerText, pageWidth / 2, footerStartY, { align: 'center' });
        doc.text(`Página ${pageNumber}`, pageWidth - margin, footerStartY, { align: 'right' });
        doc.setFontSize(previousSize);
        doc.setFont(FONT_NORMAL, previousStyle);
        doc.setTextColor(previousColor);
    };

    const checkAndAddPage = (requiredHeight) => { /* ... (código de check page sin cambios) ... */
        if (y + requiredHeight > contentEndY) {
            addFooter(currentPage);
            doc.addPage();
            currentPage++;
            y = margin;
            return true;
        }
        return false;
    };

    const blocks = analysisText.split(/\n\s*\n/).map(block => block.trim()).filter(block => block.length > 0);

    blocks.forEach((block, index) => { /* ... (lógica de procesamiento de bloques sin cambios) ... */
        let isHeading = false; let fontSize = SIZE_NORMAL; let fontStyle = STYLE_NORMAL;
        let spaceAfter = SPACE_AFTER_P; let align = 'left';

        if (block.startsWith('# ')) { fontSize = SIZE_H1; fontStyle = STYLE_BOLD; spaceAfter = SPACE_AFTER_H1; block = block.substring(2); isHeading = true; align = 'left'; }
        else if (block.startsWith('## ')) { fontSize = SIZE_H2; fontStyle = STYLE_BOLD; spaceAfter = SPACE_AFTER_H2; block = block.substring(3); isHeading = true; align = 'left'; }
        else if (block.startsWith('### ')) { fontSize = SIZE_H3; fontStyle = STYLE_BOLD; spaceAfter = SPACE_AFTER_H3; block = block.substring(4); isHeading = true; align = 'left'; }
        else if (block.startsWith('**') && block.endsWith('**') && block.length > 4) { fontStyle = STYLE_BOLD; block = block.substring(2, block.length - 2); }
        else if (block.startsWith('__') && block.endsWith('__') && block.length > 4) { fontStyle = STYLE_BOLD; block = block.substring(2, block.length - 2); }
        else if (!isHeading) { /* align = 'justify'; */ } // Mantener a la izquierda por defecto

        doc.setFontSize(fontSize); doc.setFont(FONT_NORMAL, fontStyle);
        const lines = doc.splitTextToSize(block, usableWidth);
        const lineHeight = doc.getTextDimensions('Tg', { fontSize: fontSize }).h * LINE_SPACING_FACTOR;
        const blockHeight = lines.length * lineHeight;
        const spaceBefore = (y > margin) ? SPACE_AFTER_P : 0;

        checkAndAddPage(blockHeight + spaceBefore);
        if (y > margin) { y += spaceBefore; }

        lines.forEach((line, lineIndex) => {
             const currentLineHeight = doc.getTextDimensions(line, { fontSize: fontSize }).h * LINE_SPACING_FACTOR;
             checkAndAddPage(currentLineHeight);
             doc.text(line, margin, y, { align: align, maxWidth: usableWidth });
             y += currentLineHeight;
        });
        y += spaceAfter;
    });

    if (currentPage > 0 && blocks.length > 0) { // Asegurarse que hubo contenido
        addFooter(currentPage);
    }

    try {
        const pdfBlob = doc.output('blob'); return pdfBlob;
    } catch (error) {
        console.error("Error al generar el PDF con jsPDF:", error);
        throw new Error("Error al crear el archivo PDF de salida.");
    }
}


// --- Event Listener para el botón (Modificado: usa constantes) ---
analyzeButton.addEventListener('click', async () => {
    // Ya no lee API Key ni User Prompt del HTML
    const file = pdfFileInput.files[0];

    // Validación solo para el archivo
    if (!file) {
        showStatus("Por favor, selecciona un archivo PDF.", 'error');
        pdfFileInput.focus();
        return;
    }

    analyzeButton.disabled = true;
    resultSection.style.display = 'none';
    downloadLink.href = '#';
    showStatus("Iniciando proceso...", 'processing');

    try {
        showStatus("Leyendo el archivo PDF...", 'processing');
        const pdfText = await extractPdfText(file);
        if (!pdfText || pdfText.length < 10) {
            throw new Error("No se pudo extraer texto útil del PDF.");
        }
        showStatus(`PDF leído (${pdfText.length} caracteres). Contactando IA...`, 'processing');
        console.log("Texto extraído (inicio):", pdfText.substring(0, 200) + "...");

        // Llama a la API usando las constantes definidas arriba
        const analysisResult = await callGeminiAPI(ANALYSIS_INSTRUCTIONS, pdfText);
        showStatus("Análisis IA completado. Generando PDF...", 'processing');
        console.log("Resultado del análisis:", analysisResult);

        const pdfBlob = generatePdfWithFooter(analysisResult); // Llama a la función de formato

        const pdfUrl = URL.createObjectURL(pdfBlob);
        downloadLink.href = pdfUrl;
        resultSection.style.display = 'block';
        showStatus("¡Proceso completado! PDF listo para descargar.", 'success');

    } catch (error) {
        console.error("Error en el proceso principal:", error);
        showStatus(`Error: ${error.message || 'Ocurrió un problema desconocido.'}`, 'error');
        resultSection.style.display = 'none';
    } finally {
        analyzeButton.disabled = false;
    }
});

// --- Inicialización ---
statusDiv.style.display = 'none'; // Ocultar estado inicial
