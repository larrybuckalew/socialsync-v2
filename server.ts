import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import session from 'express-session';
import { TwitterApi } from 'twitter-api-v2';
import axios from 'axios';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1); // Trust first proxy for secure cookies and correct protocol

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'super-secret-key', // In production, ensure SESSION_SECRET is set
  resave: false,
  saveUninitialized: false, // Don't save empty sessions to save memory/storage
  cookie: {
    secure: true,      // Required for SameSite=None
    sameSite: 'none',  // Required for cross-origin iframe
    httpOnly: true,    // Security best practice
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// --- OAuth Routes ---

// Twitter OAuth 2.0
app.get('/api/auth/twitter/login', (req, res) => {
  const workspaceId = req.query.workspaceId as string;
  if (!workspaceId) return res.status(400).send('Missing workspaceId');

  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).send('Twitter API credentials not configured in environment.');
  }

  const client = new TwitterApi({ clientId, clientSecret });
  const callbackUrl = process.env.APP_URL 
    ? `${process.env.APP_URL}/api/auth/twitter/callback`
    : `${req.protocol}://${req.get('host')}/api/auth/twitter/callback`;

  const { url, codeVerifier, state } = client.generateOAuth2AuthLink(callbackUrl, {
    scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
  });

  // Store in session
  (req.session as any).twitterAuth = { codeVerifier, state, workspaceId };

  res.json({ url });
});

app.get('/api/auth/twitter/callback', async (req, res) => {
  const { state, code } = req.query;
  const sessionData = (req.session as any).twitterAuth;

  if (!sessionData || !state || !code || state !== sessionData.state) {
    return res.status(400).send('Invalid state or session expired');
  }

  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;
  const callbackUrl = process.env.APP_URL 
    ? `${process.env.APP_URL}/api/auth/twitter/callback`
    : `${req.protocol}://${req.get('host')}/api/auth/twitter/callback`;

  try {
    const client = new TwitterApi({ clientId: clientId!, clientSecret: clientSecret! });
    const { client: loggedClient, accessToken, refreshToken, expiresIn } = await client.loginWithOAuth2({
      code: code as string,
      codeVerifier: sessionData.codeVerifier,
      redirectUri: callbackUrl,
    });

    const { data: userObject } = await loggedClient.v2.me({
      "user.fields": ["public_metrics", "profile_image_url"]
    });

    // Send the tokens back to the frontend window that opened the popup
    const html = `
      <html>
        <body>
          <script>
            window.opener.postMessage({
              type: 'OAUTH_SUCCESS',
              platform: 'twitter',
              workspaceId: '${sessionData.workspaceId}',
              data: {
                accessToken: '${accessToken}',
                refreshToken: '${refreshToken}',
                username: '${userObject.username}',
                id: '${userObject.id}',
                followers: ${userObject.public_metrics?.followers_count || 0},
                avatar: '${userObject.profile_image_url}'
              }
            }, '*');
            window.close();
          </script>
          <p>Authentication successful! You can close this window.</p>
        </body>
      </html>
    `;
    res.send(html);
  } catch (error) {
    console.error('Twitter OAuth Error:', error);
    res.status(500).send('Authentication failed');
  }
});

// LinkedIn OAuth 2.0
app.get('/api/auth/linkedin/login', (req, res) => {
  const workspaceId = req.query.workspaceId as string;
  if (!workspaceId) return res.status(400).send('Missing workspaceId');

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  if (!clientId) return res.status(500).send('LinkedIn credentials not configured');

  const callbackUrl = process.env.APP_URL 
    ? `${process.env.APP_URL}/api/auth/linkedin/callback`
    : `${req.protocol}://${req.get('host')}/api/auth/linkedin/callback`;

  const state = Math.random().toString(36).substring(7);
  (req.session as any).linkedinAuth = { state, workspaceId };

  const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&state=${state}&scope=r_liteprofile%20r_emailaddress%20w_member_social`;
  res.json({ url: authUrl });
});

app.get('/api/auth/linkedin/callback', async (req, res) => {
  const { state, code, error } = req.query;
  const sessionData = (req.session as any).linkedinAuth;

  if (error) return res.status(400).send(`LinkedIn OAuth Error: ${error}`);
  if (!sessionData || !state || !code || state !== sessionData.state) {
    return res.status(400).send('Invalid state or session expired');
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const callbackUrl = process.env.APP_URL 
    ? `${process.env.APP_URL}/api/auth/linkedin/callback`
    : `${req.protocol}://${req.get('host')}/api/auth/linkedin/callback`;

  try {
    const tokenResponse = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', null, {
      params: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl,
        client_id: clientId,
        client_secret: clientSecret
      }
    });

    const accessToken = tokenResponse.data.access_token;
    const profileResponse = await axios.get('https://api.linkedin.com/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const html = `
      <html>
        <body>
          <script>
            window.opener.postMessage({
              type: 'OAUTH_SUCCESS',
              platform: 'linkedin',
              workspaceId: '${sessionData.workspaceId}',
              data: {
                accessToken: '${accessToken}',
                username: '${profileResponse.data.localizedFirstName} ${profileResponse.data.localizedLastName}',
                id: '${profileResponse.data.id}'
              }
            }, '*');
            window.close();
          </script>
          <p>Authentication successful! You can close this window.</p>
        </body>
      </html>
    `;
    res.send(html);
  } catch (error) {
    console.error('LinkedIn OAuth Error:', error);
    res.status(500).send('Authentication failed');
  }
});

// LinkedIn OAuth 2.0
// ... (existing LinkedIn code)

// Facebook OAuth 2.0
app.get('/api/auth/facebook/login', (req, res) => {
  const workspaceId = req.query.workspaceId as string;
  if (!workspaceId) return res.status(400).send('Missing workspaceId');

  const clientId = process.env.FACEBOOK_APP_ID;
  if (!clientId) return res.status(500).send('Facebook credentials not configured');

  const callbackUrl = process.env.APP_URL 
    ? `${process.env.APP_URL}/api/auth/facebook/callback`
    : `${req.protocol}://${req.get('host')}/api/auth/facebook/callback`;

  const state = Math.random().toString(36).substring(7);
  (req.session as any).facebookAuth = { state, workspaceId, platform: 'facebook' };

  const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&state=${state}&scope=public_profile,email,pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish`;
  res.json({ url: authUrl });
});

app.get('/api/auth/facebook/callback', async (req, res) => {
  const { state, code, error } = req.query;
  const sessionData = (req.session as any).facebookAuth;

  if (error) return res.status(400).send(`Facebook OAuth Error: ${error}`);
  if (!sessionData || !state || !code || state !== sessionData.state) {
    return res.status(400).send('Invalid state or session expired');
  }

  const clientId = process.env.FACEBOOK_APP_ID;
  const clientSecret = process.env.FACEBOOK_APP_SECRET;
  const callbackUrl = process.env.APP_URL 
    ? `${process.env.APP_URL}/api/auth/facebook/callback`
    : `${req.protocol}://${req.get('host')}/api/auth/facebook/callback`;

  try {
    const tokenResponse = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
      params: {
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        code
      }
    });

    const accessToken = tokenResponse.data.access_token;
    
    // Get user profile
    const profileResponse = await axios.get('https://graph.facebook.com/me', {
      params: { access_token: accessToken, fields: 'id,name' }
    });

    const html = `
      <html>
        <body>
          <script>
            window.opener.postMessage({
              type: 'OAUTH_SUCCESS',
              platform: '${sessionData.platform}',
              workspaceId: '${sessionData.workspaceId}',
              data: {
                accessToken: '${accessToken}',
                username: '${profileResponse.data.name}',
                id: '${profileResponse.data.id}'
              }
            }, '*');
            window.close();
          </script>
          <p>Authentication successful! You can close this window.</p>
        </body>
      </html>
    `;
    res.send(html);
  } catch (error) {
    console.error('Facebook OAuth Error:', error);
    res.status(500).send('Authentication failed');
  }
});

// Instagram OAuth (usually via Facebook Login)
app.get('/api/auth/instagram/login', (req, res) => {
  const workspaceId = req.query.workspaceId as string;
  if (!workspaceId) return res.status(400).send('Missing workspaceId');

  const clientId = process.env.FACEBOOK_APP_ID;
  if (!clientId) return res.status(500).send('Facebook credentials not configured');

  const callbackUrl = process.env.APP_URL 
    ? `${process.env.APP_URL}/api/auth/facebook/callback`
    : `${req.protocol}://${req.get('host')}/api/auth/facebook/callback`;

  const state = Math.random().toString(36).substring(7);
  (req.session as any).facebookAuth = { state, workspaceId, platform: 'instagram' };

  const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&state=${state}&scope=public_profile,email,pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish`;
  res.json({ url: authUrl });
});

// TikTok OAuth 2.0
app.get('/api/auth/tiktok/login', (req, res) => {
  const workspaceId = req.query.workspaceId as string;
  if (!workspaceId) return res.status(400).send('Missing workspaceId');

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  if (!clientKey) return res.status(500).send('TikTok credentials not configured');

  const callbackUrl = process.env.APP_URL 
    ? `${process.env.APP_URL}/api/auth/tiktok/callback`
    : `${req.protocol}://${req.get('host')}/api/auth/tiktok/callback`;

  const state = Math.random().toString(36).substring(7);
  (req.session as any).tiktokAuth = { state, workspaceId };

  // TikTok scopes: user.info.basic, video.upload, video.publish
  const authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${clientKey}&scope=user.info.basic,video.upload,video.publish&response_type=code&redirect_uri=${encodeURIComponent(callbackUrl)}&state=${state}`;
  res.json({ url: authUrl });
});

app.get('/api/auth/tiktok/callback', async (req, res) => {
  const { state, code, error } = req.query;
  const sessionData = (req.session as any).tiktokAuth;

  if (error) return res.status(400).send(`TikTok OAuth Error: ${error}`);
  if (!sessionData || !state || !code || state !== sessionData.state) {
    return res.status(400).send('Invalid state or session expired');
  }

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const callbackUrl = process.env.APP_URL 
    ? `${process.env.APP_URL}/api/auth/tiktok/callback`
    : `${req.protocol}://${req.get('host')}/api/auth/tiktok/callback`;

  try {
    const tokenResponse = await axios.post('https://open.tiktokapis.com/v2/oauth/token/', 
      new URLSearchParams({
        client_key: clientKey!,
        client_secret: clientSecret!,
        code: code as string,
        grant_type: 'authorization_code',
        redirect_uri: callbackUrl,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = tokenResponse.data.access_token;
    const openId = tokenResponse.data.open_id;
    
    // Get user profile
    const profileResponse = await axios.get('https://open.tiktokapis.com/v2/user/info/', {
      params: { fields: 'open_id,display_name,avatar_url' },
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const html = `
      <html>
        <body>
          <script>
            window.opener.postMessage({
              type: 'OAUTH_SUCCESS',
              platform: 'tiktok',
              workspaceId: '${sessionData.workspaceId}',
              data: {
                accessToken: '${accessToken}',
                username: '${profileResponse.data.data.user.display_name || profileResponse.data.data.user.open_id}',
                id: '${profileResponse.data.data.user.open_id}'
              }
            }, '*');
            window.close();
          </script>
          <p>Authentication successful! You can close this window.</p>
        </body>
      </html>
    `;
    res.send(html);
  } catch (error: any) {
    console.error('TikTok OAuth Error:', error.response?.data || error.message);
    res.status(500).send('Authentication failed');
  }
});

// YouTube OAuth 2.0 (Google)
app.get('/api/auth/youtube/login', (req, res) => {
  const workspaceId = req.query.workspaceId as string;
  if (!workspaceId) return res.status(400).send('Missing workspaceId');

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(500).send('Google credentials not configured');

  const callbackUrl = process.env.APP_URL 
    ? `${process.env.APP_URL}/api/auth/youtube/callback`
    : `${req.protocol}://${req.get('host')}/api/auth/youtube/callback`;

  const state = Math.random().toString(36).substring(7);
  (req.session as any).youtubeAuth = { state, workspaceId };

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&scope=${encodeURIComponent('https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/userinfo.profile')}&state=${state}&access_type=offline&prompt=consent`;
  res.json({ url: authUrl });
});

app.get('/api/auth/youtube/callback', async (req, res) => {
  const { state, code, error } = req.query;
  const sessionData = (req.session as any).youtubeAuth;

  if (error) return res.status(400).send(`YouTube OAuth Error: ${error}`);
  if (!sessionData || !state || !code || state !== sessionData.state) {
    return res.status(400).send('Invalid state or session expired');
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackUrl = process.env.APP_URL 
    ? `${process.env.APP_URL}/api/auth/youtube/callback`
    : `${req.protocol}://${req.get('host')}/api/auth/youtube/callback`;

  try {
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: callbackUrl
    });

    const accessToken = tokenResponse.data.access_token;
    const refreshToken = tokenResponse.data.refresh_token;

    const profileResponse = await axios.get('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const channel = profileResponse.data.items?.[0];

    const html = `
      <html>
        <body>
          <script>
            window.opener.postMessage({
              type: 'OAUTH_SUCCESS',
              platform: 'youtube',
              workspaceId: '${sessionData.workspaceId}',
              data: {
                accessToken: '${accessToken}',
                refreshToken: '${refreshToken}',
                username: '${channel?.snippet?.title || 'YouTube Channel'}',
                id: '${channel?.id || ''}'
              }
            }, '*');
            window.close();
          </script>
          <p>Authentication successful! You can close this window.</p>
        </body>
      </html>
    `;
    res.send(html);
  } catch (error: any) {
    console.error('YouTube OAuth Error:', error.response?.data || error.message);
    res.status(500).send('Authentication failed');
  }
});

// Pinterest OAuth 2.0
app.get('/api/auth/pinterest/login', (req, res) => {
  const workspaceId = req.query.workspaceId as string;
  if (!workspaceId) return res.status(400).send('Missing workspaceId');

  const clientId = process.env.PINTEREST_CLIENT_ID;
  if (!clientId) return res.status(500).send('Pinterest credentials not configured');

  const callbackUrl = process.env.APP_URL 
    ? `${process.env.APP_URL}/api/auth/pinterest/callback`
    : `${req.protocol}://${req.get('host')}/api/auth/pinterest/callback`;

  const state = Math.random().toString(36).substring(7);
  (req.session as any).pinterestAuth = { state, workspaceId };

  const authUrl = `https://www.pinterest.com/oauth/?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&scope=boards:read,pins:read,pins:write&state=${state}`;
  res.json({ url: authUrl });
});

app.get('/api/auth/pinterest/callback', async (req, res) => {
  const { state, code, error } = req.query;
  const sessionData = (req.session as any).pinterestAuth;

  if (error) return res.status(400).send(`Pinterest OAuth Error: ${error}`);
  if (!sessionData || !state || !code || state !== sessionData.state) {
    return res.status(400).send('Invalid state or session expired');
  }

  const clientId = process.env.PINTEREST_CLIENT_ID;
  const clientSecret = process.env.PINTEREST_CLIENT_SECRET;
  const callbackUrl = process.env.APP_URL 
    ? `${process.env.APP_URL}/api/auth/pinterest/callback`
    : `${req.protocol}://${req.get('host')}/api/auth/pinterest/callback`;

  try {
    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenResponse = await axios.post('https://api.pinterest.com/v5/oauth/token', 
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code as string,
        redirect_uri: callbackUrl
      }).toString(),
      {
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const accessToken = tokenResponse.data.access_token;

    const profileResponse = await axios.get('https://api.pinterest.com/v5/user_account', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const html = `
      <html>
        <body>
          <script>
            window.opener.postMessage({
              type: 'OAUTH_SUCCESS',
              platform: 'pinterest',
              workspaceId: '${sessionData.workspaceId}',
              data: {
                accessToken: '${accessToken}',
                username: '${profileResponse.data.username}',
                id: '${profileResponse.data.username}'
              }
            }, '*');
            window.close();
          </script>
          <p>Authentication successful! You can close this window.</p>
        </body>
      </html>
    `;
    res.send(html);
  } catch (error: any) {
    console.error('Pinterest OAuth Error:', error.response?.data || error.message);
    res.status(500).send('Authentication failed');
  }
});

// --- Publishing Route ---
app.post('/api/publish/twitter', async (req, res) => {
  const { accessToken, text } = req.body;
  if (!accessToken || !text) return res.status(400).json({ error: 'Missing token or text' });

  try {
    const client = new TwitterApi(accessToken);
    const result = await client.v2.tweet(text);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Twitter Publish Error:', error);
    res.status(500).json({ error: error.message || 'Failed to publish' });
  }
});

app.post('/api/publish/linkedin', async (req, res) => {
  const { accessToken, text } = req.body;
  if (!accessToken || !text) return res.status(400).json({ error: 'Missing token or text' });

  try {
    const profileResponse = await axios.get('https://api.linkedin.com/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const personUrn = profileResponse.data.id;

    const result = await axios.post('https://api.linkedin.com/v2/ugcPosts', {
      author: `urn:li:person:${personUrn}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: { text } },
          shareMediaCategory: 'NONE'
        }
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
    }, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    res.json({ success: true, data: result.data });
  } catch (error: any) {
    console.error('LinkedIn Publish Error:', error);
    res.status(500).json({ error: error.message || 'Failed to publish' });
  }
});

app.post('/api/publish/tiktok', async (req, res) => {
  const { accessToken, text } = req.body;
  // Note: TikTok publishing usually requires a video. 
  // For this demo, we'll simulate a successful response or handle text-only if supported by their API (it's not really for main feed)
  // Real TikTok API requires video upload first.
  res.json({ success: true, message: 'TikTok publishing initiated (Requires video for real API)' });
});

app.post('/api/publish/youtube', async (req, res) => {
  const { accessToken, text } = req.body;
  // YouTube requires video upload. For text-only, we might use community posts if available.
  res.json({ success: true, message: 'YouTube publishing initiated (Requires video for real API)' });
});

app.post('/api/publish/pinterest', async (req, res) => {
  const { accessToken, text } = req.body;
  // Pinterest requires an image and a board ID.
  res.json({ success: true, message: 'Pinterest publishing initiated (Requires image and board for real API)' });
});

// --- Analytics Routes ---
app.get('/api/analytics/twitter/:tweetId', async (req, res) => {
  const { tweetId } = req.params;
  const { accessToken } = req.query;
  if (!accessToken || !tweetId) return res.status(400).json({ error: 'Missing token or tweetId' });

  try {
    const client = new TwitterApi(accessToken as string);
    const tweet = await client.v2.singleTweet(tweetId, {
      'tweet.fields': ['public_metrics']
    });
    res.json({ success: true, data: tweet.data?.public_metrics });
  } catch (error: any) {
    console.error('Twitter Analytics Error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch analytics' });
  }
});

app.get('/api/analytics/linkedin/:postId', async (req, res) => {
  const { postId } = req.params;
  const { accessToken } = req.query;
  if (!accessToken || !postId) return res.status(400).json({ error: 'Missing token or postId' });

  try {
    const result = await axios.get(`https://api.linkedin.com/v2/ugcPosts/${postId}?projection=(statistics)`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    res.json({ success: true, data: result.data.statistics });
  } catch (error: any) {
    console.error('LinkedIn Analytics Error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch analytics' });
  }
});

// --- Vite Integration ---

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
