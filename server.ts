import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import session from 'express-session';
import { TwitterApi } from 'twitter-api-v2';
import axios from 'axios';

dotenv.config();

const app = express();
const PORT = 3457;

app.set('trust proxy', 1); // Trust first proxy for secure cookies and correct protocol

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'super-secret-key', // In production, ensure SESSION_SECRET is set
  resave: false,
  saveUninitialized: false, // Don't save empty sessions to save memory/storage
  cookie: {
    secure: false,     // Set true in production with HTTPS
    sameSite: 'lax',   // Works better than 'none' for cross-origin
    httpOnly: true,    // Security best practice
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// --- Simple Password Auth ---
const APP_USER = process.env.APP_USER || 'admin';
const APP_PASS = process.env.APP_PASS || 'socialsync2026';

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === APP_USER && password === APP_PASS) {
    (req.session as any).user = { name: username, loginTime: new Date().toISOString() };
    return res.json({ success: true, user: { name: username } });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/me', (req, res) => {
  const user = (req.session as any)?.user;
  if (user) return res.json({ user });
  res.status(401).json({ error: 'Not authenticated' });
});

// In-memory workspaces/posts store (replaces Firebase for now)
const store: any = {
  workspaces: [{ id: 'default', name: 'My Workspace', ownerId: 'local-user', createdAt: new Date().toISOString() }],
  posts: [],
  notifications: [],
};

// Middleware: require auth for data endpoints
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!(req.session as any)?.user) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// --- Data API (replaces Firebase Firestore) ---
app.get('/api/workspaces', requireAuth, (req, res) => {
  res.json({ workspaces: store.workspaces });
});

app.post('/api/posts', requireAuth, (req, res) => {
  const post = { ...req.body, id: Date.now().toString(), createdAt: new Date().toISOString() };
  store.posts.push(post);
  res.json({ id: post.id });
});

app.get('/api/posts', requireAuth, (req, res) => {
  const workspaceId = req.query.workspaceId as string;
  const posts = workspaceId ? store.posts.filter((p: any) => p.workspaceId === workspaceId) : store.posts;
  res.json({ posts });
});

app.patch('/api/posts/:id', requireAuth, (req, res) => {
  const idx = store.posts.findIndex((p: any) => p.id === req.params.id);
  if (idx >= 0) { store.posts[idx] = { ...store.posts[idx], ...req.body }; return res.json({ success: true }); }
  res.status(404).json({ error: 'Not found' });
});

app.delete('/api/posts/:id', requireAuth, (req, res) => {
  store.posts = store.posts.filter((p: any) => p.id !== req.params.id);
  res.json({ success: true });
});

app.get('/api/notifications', requireAuth, (req, res) => {
  res.json({ notifications: store.notifications });
});

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

    const { data: userObject } = await loggedClient.v2.me();

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
                id: '${userObject.id}'
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
