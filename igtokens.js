// Import necessary modules
import fetch from "node-fetch"
import querystring from "querystring"
// Configuration for Instagram API
const instagramConfig = {
    clientId: process.env.INSTAGRAM_APP_ID,
    clientSecret: process.env.INSTAGRAM_APP_SECRET,
    callbackUrl: process.env.URL_BASE + "/app/redirect",
};

async function exchangeShortLivedToken(code) {
    try {

        const url = `https://api.instagram.com/oauth/access_token?`
        console.log({
            client_id: instagramConfig.clientId,
            client_secret: instagramConfig.clientSecret,
            grant_type: 'authorization_code',
            redirect_uri: instagramConfig.callbackUrl,
            code: code
        })
        // Send the request
        const response = await fetch(url, { method: 'POST', body: new URLSearchParams({
            client_id: instagramConfig.clientId,
            client_secret: instagramConfig.clientSecret,
            grant_type: 'authorization_code',
            redirect_uri: instagramConfig.callbackUrl,
            code: code
        })});
        const data = await response.json();
        if(!response.ok) {
            console.log(data)
        }
        /* console.log('Short-lived token:', data.access_token); */
        return data;
    } catch(error) {
        console.error('Error:', JSON.stringify(error));
        throw error;
    }
}
// Function to get a long-lived access token
async function exchangeLongLivedToken(shortLivedToken) {
    try {
        const url = `https://graph.instagram.com/access_token?` +
            querystring.stringify({
                grant_type: 'ig_exchange_token',
                client_secret: instagramConfig.clientSecret,
                access_token: shortLivedToken
            });
        console.log(url)
        // Send the request
        const response = await fetch(url, { method: 'GET' });
        if (!response.ok) throw new Error('Error fetching long-lived token');
        const data = await response.json();
        return data.access_token;
    } catch (error) {
        console.error('Error:', error.message);
        throw error;
    }
}

export { exchangeLongLivedToken, exchangeShortLivedToken }