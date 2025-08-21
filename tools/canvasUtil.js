const { FontLibrary } = require('skia-canvas')

function loadFonts() {
  FontLibrary.use("Cormorant", './assets/cormorant.ttf')
  FontLibrary.use("Roboto Flex", './assets/robotoflex.ttf')
}

function drawBottomAlignedText(ctx, text, x, bottomPadding, maxWidth, lineHeight) {
    const words = text.split(' ');
    const lines = [];
    let line = '';

    // Wrap text into lines
    for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + ' ';
        const testWidth = ctx.measureText(testLine).width;
        if (testWidth > maxWidth && i > 0) {
            lines.push(line.trim());
            line = words[i] + ' ';
        } else {
            line = testLine;
        }
    }
    lines.push(line.trim());

    // Measure total height
    const totalHeight = lines.length * lineHeight;

    // Function to actually draw later
    const drawFn = () => {
        let y = ctx.canvas.height - bottomPadding - totalHeight + lineHeight;
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], x, y);
            y += lineHeight;
        }
    };

    // Return [height, drawFunction]
    return [totalHeight, drawFn];
}

function prepareCenteredText(ctx, text, x, maxWidth, lineHeight) {
    // Split into paragraphs by \n first
    const paragraphs = text.split(/\n/);
    const lines = [];

    for (let p = 0; p < paragraphs.length; p++) {
        const words = paragraphs[p].split(/\s+/).filter(Boolean);
        let line = '';

        for (let i = 0; i < words.length; i++) {
            const testLine = line + words[i] + ' ';
            const testWidth = ctx.measureText(testLine).width;
            if (testWidth > maxWidth && line !== '') {
                lines.push(line.trim());
                line = words[i] + ' ';
            } else {
                line = testLine;
            }
        }
        if (line) lines.push(line.trim());

        // Add a blank line if this isn't the last paragraph
        if (p < paragraphs.length - 1) {
            lines.push('');
        }
    }

    const totalHeight = lines.length * lineHeight;

    const needsBaselineOffset = !(ctx.textBaseline === 'top' || ctx.textBaseline === 'hanging');
    const baselineOffset = needsBaselineOffset ? lineHeight : 0;

    const drawAt = (centerY) => {
        let y = centerY - totalHeight / 2 + baselineOffset;
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], x, y);
            y += lineHeight;
        }
    };

    return [totalHeight, drawAt];
}


function drawTransition(ctx, x, y, width, height, fadeStart = 0) {
    const gradient = ctx.createLinearGradient(0, y, 0, y + height);

    // Transparent from top until fadeStart point
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    if (fadeStart > 0) {
        gradient.addColorStop(fadeStart, 'rgba(0, 0, 0, 0)');
    }
    // Fully black at bottom
    gradient.addColorStop(1, 'rgba(0, 0, 0, 1)');

    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, height);
}

module.exports = { drawBottomAlignedText, loadFonts, drawTransition, prepareCenteredText }