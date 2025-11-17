
export const splitText = (text: string, maxLength: number): string[] => {
    const chunks: string[] = [];
    let remainingText = text.trim();

    while (remainingText.length > 0) {
        if (remainingText.length <= maxLength) {
            chunks.push(remainingText);
            break;
        }

        // Analisa o texto até o limite de caracteres para encontrar o melhor ponto de corte.
        const textSlice = remainingText.substring(0, maxLength + 1);
        
        // Prioridade 1: Encontrar o último finalizador de sentença (., ?, !, \n).
        let splitPos = -1;
        const sentenceEnders = ['.', '?', '!', '\n'];
        for (const p of sentenceEnders) {
            const pos = textSlice.lastIndexOf(p);
            if (pos > splitPos) {
                splitPos = pos;
            }
        }

        // Prioridade 2: Se não houver finalizador de sentença, encontrar o último espaço.
        if (splitPos === -1) {
            splitPos = textSlice.lastIndexOf(' ');
        }

        // Se nenhum ponto de quebra natural for encontrado, corta no limite máximo.
        if (splitPos === -1 || splitPos === 0) {
            splitPos = maxLength;
        } else {
             // O corte é feito após o caractere de quebra.
            splitPos += 1;
        }

        const chunk = remainingText.substring(0, splitPos).trim();
        if (chunk) {
            chunks.push(chunk);
        }
        remainingText = remainingText.substring(splitPos).trim();
    }

    return chunks;
};
