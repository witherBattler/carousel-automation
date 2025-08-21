function stripHtmlTagsSafe(input) {
    if (typeof input !== 'string') return input;

    // Matches only valid HTML tags, ignores stray/malformed < or >
    const tagPattern = /<\/?[a-zA-Z][a-zA-Z0-9]*(\s+[a-zA-Z_:][-a-zA-Z0-9_:.]*(\s*=\s*(?:"[^"]*"|'[^']*'|[^'">\s]+))?)*\s*\/?>/g;

    return input.replace(tagPattern, '');
}

function extractVisibleText(html) {
    if (typeof html !== 'string') return html;

    // Remove <script> and <style> blocks completely
    html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    html = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');

    // Remove comments
    html = html.replace(/<!--[\s\S]*?-->/g, '');

    // Remove all remaining HTML tags safely
    html = html.replace(/<\/?[a-zA-Z][a-zA-Z0-9]*(\s+[a-zA-Z_:][-a-zA-Z0-9_:.]*(\s*=\s*(?:"[^"]*"|'[^']*'|[^'">\s]+))?)*\s*\/?>/g, '');

    // Decode HTML entities if needed (basic ones)
    html = html.replace(/&nbsp;/gi, ' ')
               .replace(/&lt;/gi, '<')
               .replace(/&gt;/gi, '>')
               .replace(/&amp;/gi, '&')
               .replace(/&quot;/gi, '"')
               .replace(/&apos;/gi, "'");

    // Collapse multiple spaces and newlines
    html = html.replace(/\s+/g, ' ').trim();

    return html;
}

async function getHTML(url) {
  console.log(process.env.APILAYER_API_KEY, "API KEY")
  var myHeaders = new Headers();
  myHeaders.append("apikey", process.env.APILAYER_API_KEY);

  var requestOptions = {
    method: 'GET',
    redirect: 'follow',
    headers: myHeaders
  };

  const response = await fetch("https://api.apilayer.com/scraper?url=" + url, requestOptions)
  console.log(response)
  const json = await response.json()
  console.log(json.data.substring(0, 100), "HTML")
  return json.data
}


module.exports = { stripHtmlTagsSafe, extractVisibleText, getHTML };