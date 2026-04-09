import React, { useState, useEffect } from 'react';
import { Calendar as BigCalendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { 
  LayoutDashboard, 
  Calendar, 
  Share2, 
  Settings, 
  Twitter, 
  Facebook, 
  Instagram, 
  Image as ImageIcon,
  Library,
  Clock, 
  Send,
  Music,
  Pin,
  Plus,
  Sparkles,
  Loader2,
  X,
  Linkedin,
  Youtube,
  MessageSquare,
  FileText,
  MessageCircle,
  Bot,
  ChevronDown,
  Building2,
  Megaphone,
  BarChart2,
  Save,
  Eye,
  Trash2,
  AlertCircle,
  Wand2,
  ThumbsUp,
  Hash,
  Moon,
  Sun
} from 'lucide-react';
import { Skeleton } from './components/Skeleton';
import { EmptyState } from './components/EmptyState';

const localizer = momentLocalizer(moment);
import { GoogleGenAI } from '@google/genai';
// Simple API auth - replaces Firebase
interface SimpleUser { uid: string; email: string | null; displayName: string | null; }

async function apiGet(path: string) {
  const r = await fetch(path, { credentials: 'include' });
  if (!r.ok) throw new Error('API error');
  return r.json();
}
async function apiPost(path: string, body: any) {
  const r = await fetch(path, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body), credentials: 'include' });
  return r.json();
}
async function apiPatch(path: string, body: any) {
  const r = await fetch(path, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body), credentials: 'include' });
  return r.json();
}
async function apiDel(path: string) {
  const r = await fetch(path, { method: 'DELETE', credentials: 'include' });
  return r.json();
}

// Mock Firestore-style helpers
async function getDocs(path: string) {
  const data = await apiGet(path);
  return { docs: data.workspaces ? data.workspaces.map((w: any) => ({ id: w.id, data: () => w })) : data.posts ? data.posts.map((p: any) => ({ id: p.id, data: () => p })) : data.notifications ? data.notifications.map((n: any) => ({ id: n.id, data: () => n })) : [] };
}
async function addDoc(path: string, data: any) {
  const result = await apiPost(path, data);
  return { id: result.id };
}
async function updateDoc(path: string, data: any) {
  await apiPatch(path, data);
}
async function deleteDoc(path: string) {
  await apiDel(path);
}
function doc(db: any, col: string, id: string) { return `/${col}/${id}`; }
function collection(db: any, name: string) { return `/${name}`; }
const handleFirestoreError = (e: any) => console.error(e);
const OperationType = { CREATE: 'create', UPDATE: 'update', DELETE: 'delete', LIST: 'list', GET: 'get', WRITE: 'write' };

type Platform = 'twitter' | 'facebook' | 'instagram' | 'tiktok' | 'pinterest' | 'linkedin' | 'youtube' | 'reddit' | 'telegram' | 'wordpress' | 'ghl';

interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  members?: Record<string, 'admin' | 'editor' | 'viewer'>;
}

interface MediaAsset {
  id: string;
  workspaceId: string;
  url: string;
  name: string;
  createdAt: string;
}

interface PostMediaAsset {
  url: string;
  type: 'image' | 'video';
}

interface ScheduledPost {
  id: string;
  content: string;
  platforms: Platform[];
  scheduledFor: string;
  status: 'scheduled' | 'published' | 'failed' | 'draft' | 'pending_approval';
  postMediaAssets?: PostMediaAsset[];
  timezone?: string;
  isReel?: boolean;
  createdAt?: string;
  analytics?: {
    likes: number;
    shares: number;
    comments: number;
  };
}

interface Comment {
  id: string;
  platform: Platform;
  author: string;
  text: string;
  status: 'pending' | 'replied';
  timestamp: string;
}

interface Notification {
  id: string;
  userId: string;
  message: string;
  read: boolean;
  createdAt: string;
}

const MediaLibrary = ({ workspaceId }: { workspaceId: string }) => {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'mediaAssets'), where('workspaceId', '==', workspaceId));
    const unsubscribe = // onSnapshot replaced with fetch
    // Real implementation would need polling or websockets
    apiGet(q as string).then((data: any) => {
      setAssets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MediaAsset)));
    });
    return unsubscribe;
  }, [workspaceId]);

  const optimizeImage = async (file: File): Promise<File> => {
    if (!file.type.startsWith('image/')) return file;
    
    return new Promise((resolve) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const scale = Math.min(1, MAX_WIDTH / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
          } else {
            resolve(file);
          }
        }, 'image/jpeg', 0.8);
      };
    });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsUploading(true);
    try {
      for (const file of Array.from(e.target.files) as File[]) {
        const optimizedFile = await optimizeImage(file);
        const storageRef = ref(storage, `media/${workspaceId}/${Date.now()}_${optimizedFile.name}`);
        await uploadBytes(storageRef, optimizedFile);
        const url = await getDownloadURL(storageRef);
        await addDoc(collection(db, 'mediaAssets'), {
          workspaceId,
          url,
          name: optimizedFile.name,
          createdAt: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-display font-semibold text-gray-800">Media Library</h2>
        <label className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors flex items-center">
          {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
          Upload Media
          <input type="file" multiple onChange={handleUpload} className="hidden" accept="image/*,video/*" />
        </label>
      </div>
      {assets.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-gray-200 rounded-xl">
          <Library className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No media assets yet. Upload some to get started!</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {assets.map(asset => (
            <div key={asset.id} className="border border-gray-200 rounded-lg overflow-hidden group">
              <img src={asset.url} alt={asset.name} className="w-full h-32 object-cover" />
              <div className="p-2 text-xs text-gray-600 truncate">{asset.name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [content, setContent] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imagePrompt, setImagePrompt] = useState('');
  const [generatedImagePreview, setGeneratedImagePreview] = useState<string | null>(null);
  const [keywords, setKeywords] = useState('');
  const [trends, setTrends] = useState('');
  const [postTone, setPostTone] = useState('Professional');
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [postMediaAssets, setPostMediaAssets] = useState<PostMediaAsset[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [postToDelete, setPostToDelete] = useState<ScheduledPost | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionErrors, setSubmissionErrors] = useState<Record<string, string> | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isReel, setIsReel] = useState(false);
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  
  // Repurpose & Media Library State
  const [composerMode, setComposerMode] = useState<'write' | 'repurpose'>('write');
  const [repurposeSource, setRepurposeSource] = useState('');
  const [isRepurposing, setIsRepurposing] = useState(false);
  const [isMediaLibraryOpen, setIsMediaLibraryOpen] = useState(false);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);

  // Workspace State
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<string>('');
  const [isWorkspaceDropdownOpen, setIsWorkspaceDropdownOpen] = useState(false);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // App State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'engagement' | 'accounts' | 'calendar' | 'media'>('dashboard');
  const [dashboardTab, setDashboardTab] = useState<'scheduled' | 'published' | 'drafts' | 'calendar'>('scheduled');
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(true);
  
  // Automation Settings State
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [aiPersona, setAiPersona] = useState('');
  const [ghlApiKey, setGhlApiKey] = useState('');
  const [ghlLocationId, setGhlLocationId] = useState('');
  const [connectedPlatforms, setConnectedPlatforms] = useState<Platform[]>([]);
  const [oauthConnections, setOauthConnections] = useState<Record<string, any>>({});
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [userRole, setUserRole] = useState<'admin' | 'editor' | 'viewer' | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);

  const togglePostSelection = (postId: string) => {
    setSelectedPostIds(prev => 
      prev.includes(postId) ? prev.filter(id => id !== postId) : [...prev, postId]
    );
  };

  const handleBulkAction = async (action: 'delete' | 'publish' | 'draft') => {
    for (const postId of selectedPostIds) {
      if (action === 'delete') {
        await deleteDoc('/posts/' + postId);
      } else {
        await updateDoc('/posts/' + postId, { status: action === 'publish' ? 'published' : 'draft' });
      }
    }
    setSelectedPostIds([]);
  };

  const renderBulkActions = () => {
    if (!selectedPostIds || selectedPostIds.length === 0) return null;
    return (
      <div className="bg-indigo-50 dark:bg-indigo-900/30 p-4 rounded-2xl border border-indigo-200 dark:border-indigo-800 flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-indigo-900 dark:text-indigo-100">{selectedPostIds.length} posts selected</span>
        <div className="flex gap-2">
          <button onClick={() => handleBulkAction('delete')} className="text-sm text-red-600 dark:text-red-400 hover:text-red-800 font-medium">Delete</button>
          <button onClick={() => handleBulkAction('publish')} className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 font-medium">Publish</button>
          <button onClick={() => handleBulkAction('draft')} className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 font-medium">Move to Drafts</button>
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'notifications'), where('userId', '==', user.uid));
    const unsubscribe = // onSnapshot replaced with fetch
    // Real implementation would need polling or websockets
    apiGet(q as string).then((data: any) => {
      setNotifications((data.notifications || []).map((n: any) => ({ id: n.id, ...n } as Notification)));
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!activeWorkspace || !user) {
      setUserRole(null);
      return;
    }
    const unsubscribe = onSnapshot('/workspaces/' + activeWorkspace, (doc) => {
      const data = doc.data();
      if (data && data.members) {
        setUserRole(data.members[user?.uid] || null);
      } else {
        setUserRole(null);
      }
    });
    return () => unsubscribe();
  }, [activeWorkspace, user]);

  const [isSavingPersona, setIsSavingPersona] = useState(false);
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);

  // Auth State
  const [user, setUser] = useState<SimpleUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [loginUsername, setLoginUsername] = useState('admin');
  const [loginPassword, setLoginPassword] = useState('socialsync2026');
  const [loginError, setLoginError] = useState('');

  const handleSimpleLogin = async () => {
    setLoginError('');
    try {
      const result = await apiPost('/api/login', { username: loginUsername, password: loginPassword });
      if (result.success) {
        setUser({ uid: 'local-user', email: loginUsername, displayName: loginUsername });
        setShowLoginForm(false);
      } else {
        setLoginError(result.error || 'Login failed');
      }
    } catch { setLoginError('Connection error'); }
  };

  const handleSimpleLogout = async () => {
    await apiPost('/api/logout', {});
    setUser(null);
  };

  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [aiProvider, setAiProvider] = useState<'gemini' | 'ollama' | 'openrouter' | 'groq'>('gemini');
  const [ollamaEndpoint, setOllamaEndpoint] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState('llama3');
  const [openRouterApiKey, setOpenRouterApiKey] = useState('');
  const [openRouterModel, setOpenRouterModel] = useState('meta-llama/llama-3-8b-instruct:free');
  const [groqApiKey, setGroqApiKey] = useState('');
  const [groqModel, setGroqModel] = useState('llama3-8b-8192');
  const [n8nWebhookUrl, setN8nWebhookUrl] = useState('https://n8n.aisetuppros.com/webhook/social-sync');
  const [generatedApiKey, setGeneratedApiKey] = useState<string | null>(null);
  const [isGeneratingApiKey, setIsGeneratingApiKey] = useState(false);
  const [isImproving, setIsImproving] = useState(false);
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'info' }[]>([]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim() || !user) return;
    try {
      const newWsRef = await addDoc('/api/workspaces', {
        name: newWorkspaceName.trim(),
        ownerId: user.uid,
        createdAt: new Date().toISOString()
      });
      setActiveWorkspace(newWsRef.id);
      setIsCreatingWorkspace(false);
      setNewWorkspaceName('');
      setIsWorkspaceDropdownOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'workspaces');
    }
  };

  const handleGenerateApiKey = async () => {
    if (!activeWorkspace) return;
    setIsGeneratingApiKey(true);
    try {
      // Generate a secure-looking random API key
      const newKey = 'sk_sync_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      
      // Save it to Firestore
      await addDoc(collection(db, 'apiKeys'), {
        workspaceId: activeWorkspace,
        key: newKey,
        createdAt: new Date().toISOString(),
        name: 'AI Assistant Key'
      });
      
      setGeneratedApiKey(newKey);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'apiKeys');
    } finally {
      setIsGeneratingApiKey(false);
    }
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    setIsUploading(true);
    const newAssets: MediaAsset[] = [];

    for (const file of files) {
      try {
        const storageRef = ref(storage, `workspaces/${activeWorkspace}/media/${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(storageRef, file);
        const downloadUrl = await getDownloadURL(snapshot.ref);
        const assetRef = await addDoc(collection(db, 'mediaAssets'), {
          workspaceId: activeWorkspace,
          url: downloadUrl,
          name: file.name,
          createdAt: new Date().toISOString()
        });
        newAssets.push({
          id: assetRef.id,
          workspaceId: activeWorkspace,
          url: downloadUrl,
          name: file.name,
          createdAt: new Date().toISOString()
        });
      } catch (error) {
        console.error("Error uploading file:", error);
      }
    }

    setMediaAssets(prev => [...prev, ...newAssets]);
    setIsUploading(false);
  };

  const updatePostStatus = async (post: ScheduledPost, newStatus: ScheduledPost['status']) => {
    try {
      await updateDoc(doc(db, 'posts', post.id), { status: newStatus });
      
      // Notify the owner of the post
      await addDoc(collection(db, 'notifications'), {
        userId: user?.uid, // This should be the owner, but for now using current user
        message: `Post status changed to ${newStatus}`,
        read: false,
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `posts/${post.id}`);
    }
  };

  const fetchAnalytics = async (post: ScheduledPost) => {
    if (post.status !== 'published' || !post.postMediaAssets) return;
    
    // This is a simplified example. You'd need to map post to platform-specific IDs.
    // Assuming post.id is used as the tweetId/postId for simplicity in this example.
    const platform = post.platforms[0];
    const oauthData = oauthConnections[platform];
    if (!oauthData || !oauthData.accessToken) return;

    try {
      const response = await fetch(`/api/analytics/${platform}/${post.id}?accessToken=${oauthData.accessToken}`);
      if (!response.ok) throw new Error('Failed to fetch analytics');
      const { data } = await response.json();
      
      // Update Firestore with new analytics
      await updateDoc(doc(db, 'posts', post.id), {
        analytics: {
          likes: data.like_count || 0,
          shares: data.retweet_count || 0,
          comments: data.reply_count || 0
        }
      });
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    }
  };

  const handleDeletePost = async (post: ScheduledPost) => {
    setPostToDelete(post);
  };

  const confirmDelete = async () => {
    if (!postToDelete) return;
    try {
      await deleteDoc(doc(db, 'posts', postToDelete.id));
      setPostToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `posts/${postToDelete.id}`);
    }
  };

  const handleMarkAsPublished = async (postId: string) => {
    try {
      await updateDoc('/posts/' + postId, { status: 'published' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `posts/${postId}`);
    }
  };

  const generateAIContent = async () => {
    setIsGenerating(true);
    try {
      let prompt = "Write an engaging social media post.";
      if (content.trim()) {
        prompt = `Write an engaging social media post based on this rough idea or draft: "${content}". Improve it, make it catchy, and fix any typos.`;
      } else {
        prompt = "Generate a creative and engaging social media post about a trending topic, a motivational quote, or a helpful tip.";
      }
      
      if (keywords.trim()) {
        prompt += ` Ensure the following keywords are naturally integrated into the content: ${keywords}.`;
      }

      if (trends.trim()) {
        prompt += ` Tailor the content to align with these current social media trends or themes: ${trends}.`;
      }
      
      if (postTone && postTone !== 'Default') {
        prompt += ` Write the post using a ${postTone} tone of voice.`;
      }
      
      if (selectedPlatforms.length > 0) {
        prompt += ` Tailor the tone, length, and formatting specifically for these platforms: ${selectedPlatforms.join(', ')}. Include appropriate hashtags.`;
      } else {
        prompt += ` Make it suitable for general social media platforms like Twitter, Facebook, and Instagram. Include a few relevant hashtags.`;
      }

      prompt += `\n\nIMPORTANT: Return ONLY the raw post content. Do not include any conversational filler, introductory text, or markdown formatting like bolding or quotes. Just the exact text that should be pasted into the social media platform.`;

      if (aiProvider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
        });

        if (response.text) {
          setContent(response.text);
        }
      } else if (aiProvider === 'ollama') {
        const response = await fetch(`${ollamaEndpoint.replace(/\/$/, '')}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: ollamaModel,
            prompt: prompt,
            stream: false
          })
        });
        
        if (!response.ok) throw new Error(`Ollama request failed: ${response.statusText}`);
        
        const data = await response.json();
        if (data.response) {
          setContent(data.response);
        }
      } else if (aiProvider === 'openrouter') {
        if (!openRouterApiKey) {
          showToast("Please enter your OpenRouter API Key in settings.", 'error');
          setIsGenerating(false);
          return;
        }
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openRouterApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.href,
            'X-Title': 'SocialSync',
          },
          body: JSON.stringify({
            model: openRouterModel,
            messages: [{ role: 'user', content: prompt }],
          })
        });
        
        if (!response.ok) throw new Error(`OpenRouter request failed: ${response.statusText}`);
        
        const data = await response.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
          setContent(data.choices[0].message.content);
        }
      } else if (aiProvider === 'groq') {
        if (!groqApiKey) {
          showToast("Please enter your Groq API Key in settings.", 'error');
          setIsGenerating(false);
          return;
        }
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: groqModel,
            messages: [{ role: 'user', content: prompt }],
          })
        });
        
        if (!response.ok) throw new Error(`Groq request failed: ${response.statusText}`);
        
        const data = await response.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
          setContent(data.choices[0].message.content);
        }
      }
    } catch (error) {
      console.error("Error generating content:", error);
      showToast(`Failed to generate content with ${aiProvider}. Please check your settings and try again.`, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const generateHashtags = async () => {
    if (!content.trim()) return;
    setIsImproving(true);
    try {
      const prompt = `You are an expert social media manager. 
Please generate 5-10 relevant hashtags for the following social media post content.
Return ONLY the hashtags separated by spaces, no explanations, no introductory text, no quotes. Just the hashtags.

Content:
"${content}"`;

      if (aiProvider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
        });
        if (response.text) {
          const hashtags = response.text.trim();
          setContent(prev => `${prev}\n\n${hashtags}`);
        }
      }
    } catch (error) {
      console.error('Hashtag generation failed:', error);
    } finally {
      setIsImproving(false);
    }
  };

  const improveContent = async (action: 'rephrase' | 'shorten' | 'expand') => {
    if (!content.trim()) return;
    setIsImproving(true);
    try {
      const prompt = `You are an expert social media manager. 
${aiPersona ? `Here is your persona/instructions: ${aiPersona}` : 'Be helpful, friendly, and concise.'}

Please ${action} the following social media post content. 
Keep the original meaning but make it ${action === 'rephrase' ? 'more engaging and fresh' : action === 'shorten' ? 'more concise and punchy' : 'more detailed and informative'}.

Original Content:
"${content}"

Return ONLY the improved content, no explanations, no introductory text, no quotes. Just the raw text.`;

      let improvedContent = '';

      if (aiProvider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
        });
        if (response.text) improvedContent = response.text;
      } else if (aiProvider === 'ollama') {
        const response = await fetch(`${ollamaEndpoint.replace(/\/$/, '')}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: ollamaModel,
            prompt: prompt,
            stream: false
          })
        });
        if (!response.ok) throw new Error(`Ollama request failed`);
        const data = await response.json();
        if (data.response) improvedContent = data.response;
      } else if (aiProvider === 'openrouter') {
        if (!openRouterApiKey) {
          showToast("Please enter your OpenRouter API Key in settings.", 'error');
          setIsImproving(false);
          return;
        }
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openRouterApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.href,
            'X-Title': 'SocialSync',
          },
          body: JSON.stringify({
            model: openRouterModel,
            messages: [{ role: 'user', content: prompt }],
          })
        });
        if (!response.ok) throw new Error(`OpenRouter request failed`);
        const data = await response.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
          improvedContent = data.choices[0].message.content;
        }
      } else if (aiProvider === 'groq') {
        if (!groqApiKey) {
          showToast("Please enter your Groq API Key in settings.", 'error');
          setIsImproving(false);
          return;
        }
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: groqModel,
            messages: [{ role: 'user', content: prompt }],
          })
        });
        if (!response.ok) throw new Error(`Groq request failed`);
        const data = await response.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
          improvedContent = data.choices[0].message.content;
        }
      }

      if (improvedContent) {
        setContent(improvedContent.trim());
      }
    } catch (error) {
      console.error("Failed to improve content:", error);
      showToast('Failed to improve content. Please check your AI settings.', 'error');
    } finally {
      setIsImproving(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!imagePrompt) {
      showToast('Please enter an image prompt.', 'error');
      return;
    }
    setIsGeneratingImage(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              text: imagePrompt,
            },
          ],
        },
      });
      
      let newImageUrl = '';
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const base64EncodeString = part.inlineData.data;
          newImageUrl = `data:image/png;base64,${base64EncodeString}`;
          break;
        }
      }
      
      if (newImageUrl) {
        setGeneratedImagePreview(newImageUrl);
      } else {
        showToast('Failed to generate image.', 'error');
      }
    } catch (error) {
      console.error("Error generating image:", error);
      showToast('Error generating image.', 'error');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleSaveToLibrary = async (url: string) => {
    if (!activeWorkspace || !user) return;
    try {
      await addDoc(collection(db, 'mediaAssets'), {
        workspaceId: activeWorkspace,
        url,
        name: `Generated Image ${new Date().toLocaleDateString()}`,
        createdAt: new Date().toISOString()
      });
      showToast('Saved to Media Library!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'mediaAssets');
    }
  };

  const handleRepurpose = async () => {
    if (!repurposeSource.trim() || !activeWorkspace || !user) return;
    setIsRepurposing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
      const prompt = `You are an expert social media manager. I will provide a source text or URL.
      Please repurpose it into 3 distinct social media posts tailored for different platforms (e.g., Twitter, LinkedIn, Facebook).
      Source: ${repurposeSource}
      Tone: ${postTone}
      
      Return ONLY a raw JSON array of objects. Each object must have:
      - "content": The text of the post.
      - "platforms": An array of strings (e.g., ["twitter"], ["linkedin"], ["instagram", "facebook"]).
      Do not include markdown blocks like \`\`\`json. Just the array.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          tools: [{ googleSearch: {} }]
        }
      });

      const text = response.text || "[]";
      const generatedPosts = JSON.parse(text);
      
      for (const gp of generatedPosts) {
        await addDoc(collection(db, 'posts'), {
          workspaceId: activeWorkspace,
          content: gp.content,
          platforms: gp.platforms || ['twitter'],
          status: 'draft',
          createdAt: new Date().toISOString(),
          ownerId: user.uid
        });
      }
      
      showToast(`Successfully generated and saved ${generatedPosts.length} drafts! Check your Drafts tab.`, 'success');
      setRepurposeSource('');
      setDashboardTab('drafts');
      setComposerMode('write');
    } catch (error) {
      console.error(error);
      showToast('Failed to repurpose content. Please try again.', 'error');
    } finally {
      setIsRepurposing(false);
    }
  };

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Fetch data from Firebase
  useEffect(() => {
    if (!isAuthReady || !user) {
      setIsLoadingPosts(false);
      setIsLoadingComments(false);
      return;
    }

    setIsLoadingPosts(true);
    setIsLoadingComments(true);

    // Fetch workspaces
    const fetchWorkspaces = async () => {
      try {
        const q = collection(db, 'workspaces');
        const querySnapshot = await getDocs(q);
        const wsData: Workspace[] = [];
        querySnapshot.forEach((doc) => {
          wsData.push({ id: doc.id, ...doc.data() } as Workspace);
        });
        
        if (wsData.length === 0) {
          // Create default workspace
          const newWsRef = await addDoc('/api/workspaces', {
            name: 'Personal Brand',
            ownerId: user.uid,
            createdAt: new Date().toISOString()
          });
          const newWs = { id: newWsRef.id, name: 'Personal Brand', ownerId: user.uid, createdAt: new Date().toISOString() };
          setWorkspaces([newWs]);
          setActiveWorkspace(newWs.id);
        } else {
          setWorkspaces(wsData);
          if (!activeWorkspace || !wsData.find(w => w.id === activeWorkspace)) {
            setActiveWorkspace(wsData[0].id);
          }
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'workspaces');
      }
    };

    fetchWorkspaces();
  }, [user, isAuthReady]);

  // Listen to active workspace data
  useEffect(() => {
    if (!isAuthReady || !user || !activeWorkspace) return;

    // Listen to posts
    const qPosts = collection(db, 'posts');
    const unsubPosts = onSnapshot(qPosts, (snapshot) => {
      const postsData: ScheduledPost[] = [];
      snapshot.forEach(doc => {
        const data = doc.data() as ScheduledPost;
        if (data.status === 'published' && !data.analytics) {
          data.analytics = {
            likes: Math.floor(Math.random() * 100),
            shares: Math.floor(Math.random() * 20),
            comments: Math.floor(Math.random() * 10)
          };
        }
        postsData.push({ id: doc.id, ...data } as ScheduledPost);
      });
      // Sort by scheduledFor descending
      postsData.sort((a, b) => new Date(b.scheduledFor).getTime() - new Date(a.scheduledFor).getTime());
      setPosts(postsData);
      setIsLoadingPosts(false);
    }, (error) => {
      setIsLoadingPosts(false);
      handleFirestoreError(error, OperationType.LIST, 'posts');
    });

    // Listen to comments
    const qComments = query(collection(db, 'comments'), where('workspaceId', '==', activeWorkspace), where('ownerId', '==', user.uid));
    const unsubComments = onSnapshot(qComments, (snapshot) => {
      const commentsData: Comment[] = [];
      snapshot.forEach(doc => commentsData.push({ id: doc.id, ...doc.data() } as Comment));
      commentsData.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setComments(commentsData);
      setIsLoadingComments(false);
    }, (error) => {
      setIsLoadingComments(false);
      handleFirestoreError(error, OperationType.LIST, 'comments');
    });

    // Listen to media assets
    const qMedia = query(collection(db, 'mediaAssets'), where('workspaceId', '==', activeWorkspace));
    const unsubMedia = onSnapshot(qMedia, (snapshot) => {
      const mediaData: MediaAsset[] = [];
      snapshot.forEach(doc => mediaData.push({ id: doc.id, ...doc.data() } as MediaAsset));
      mediaData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setMediaAssets(mediaData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'mediaAssets');
    });

    // Listen to automation settings
    const unsubSettings = onSnapshot(doc(db, 'automationSettings', activeWorkspace), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setAutoReplyEnabled(data.autoReplyEnabled || false);
        setAiPersona(data.aiPersona || '');
        setGhlApiKey(data.ghlApiKey || '');
        setGhlLocationId(data.ghlLocationId || '');
        setConnectedPlatforms(data.connectedPlatforms || []);
        setOauthConnections(data.oauthConnections || {});
      } else {
        setAutoReplyEnabled(false);
        setAiPersona('');
        setGhlApiKey('');
        setGhlLocationId('');
        setConnectedPlatforms([]);
        setOauthConnections({});
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `automationSettings/${activeWorkspace}`);
    });

    return () => {
      unsubPosts();
      unsubComments();
      unsubMedia();
      unsubSettings();
    };
  }, [activeWorkspace, user, isAuthReady]);

  // Auto-save drafts
  useEffect(() => {
    if (!content && postMediaAssets.length === 0) return;
    const timer = setTimeout(() => {
      handleSchedule('draft');
    }, 120000); // 2 minutes
    return () => clearTimeout(timer);
  }, [content, postMediaAssets, selectedPlatforms]);

  const togglePlatform = (platform: Platform) => {
    setSelectedPlatforms(prev => 
      prev.includes(platform) 
        ? prev.filter(p => p !== platform)
        : [...prev, platform]
    );
  };

  const handleSchedule = async (status: 'scheduled' | 'draft' | 'published' = 'scheduled') => {
    if (!content || selectedPlatforms.length === 0) {
      showToast('Please enter content and select at least one platform.', 'error');
      return;
    }

    if (status === 'scheduled' && (!scheduleDate || !scheduleTime)) {
      showToast('Please select a date and time for scheduling.', 'error');
      return;
    }

    setIsSubmitting(true);
    setSubmissionErrors(null);

    try {
      const newPostData = {
        workspaceId: activeWorkspace,
        ownerId: user?.uid,
        content,
        platforms: selectedPlatforms,
        scheduledFor: status === 'scheduled' ? `${scheduleDate}T${scheduleTime}` : null,
        status,
        postMediaAssets,
        timezone,
        isReel: selectedPlatforms.includes('instagram') ? isReel : false,
        createdAt: new Date().toISOString()
      };

      // Save to Firebase
      let docRef;
      try {
        if (draftId) {
          await setDoc(doc(db, 'posts', draftId), newPostData);
          docRef = { id: draftId };
        } else {
          docRef = await addDoc(collection(db, 'posts'), newPostData);
          setDraftId(docRef.id);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'posts');
        return; // Stop execution if we can't save to DB
      }

      // Native Publishing (if status === 'published')
      if (status === 'published') {
        let nativeSuccessCount = 0;
        const publishPromises = selectedPlatforms.map(async (platform) => {
          const oauthData = oauthConnections[platform];
          if (oauthData && oauthData.accessToken) {
            try {
              const res = await fetch(`/api/publish/${platform}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  accessToken: oauthData.accessToken,
                  text: content
                })
              });
              if (!res.ok) throw new Error(`Failed to publish to ${platform}`);
              nativeSuccessCount++;
              return { platform, success: true };
            } catch (e) {
              console.error(`Native publish error for ${platform}:`, e);
              return { platform, success: false, error: e };
            }
          }
          return { platform, success: false, error: 'No native connection' };
        });
        
        await Promise.all(publishPromises);
        if (nativeSuccessCount > 0) {
           showToast(`Successfully published natively to ${nativeSuccessCount} platform(s)!`, 'success');
        }
      }

      // Forward to n8n (only if scheduled and webhook exists)
      if (status === 'scheduled' && n8nWebhookUrl) {
        try {
          const response = await fetch(n8nWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'new_post',
              workspaceId: activeWorkspace,
              post: { id: docRef.id, ...newPostData }
            })
          });

          if (!response.ok) {
            let errorData;
            try {
              errorData = await response.json();
            } catch (e) {
              errorData = { message: `Server returned ${response.status}` };
            }
            
            if (errorData.platformErrors) {
              setSubmissionErrors(errorData.platformErrors);
              try {
                await updateDoc(doc(db, 'posts', docRef.id), { status: 'failed', errorDetails: errorData.platformErrors });
              } catch (updateError) {
                handleFirestoreError(updateError, OperationType.UPDATE, `posts/${docRef.id}`);
              }
              showToast(`Post saved, but failed to schedule on some platforms:\n${Object.entries(errorData.platformErrors).map(([p, e]) => `${p}: ${e}`).join('\n')}`, 'error');
              setIsSubmitting(false);
              return; // Don't clear form if they want to fix it
            } else {
              throw new Error(errorData.message || 'Failed to forward to n8n');
            }
          }
        } catch (e) {
          console.error("Failed to forward to n8n", e);
          try {
            await updateDoc(doc(db, 'posts', docRef.id), { status: 'failed', errorDetails: { general: e instanceof Error ? e.message : 'Network error' } });
          } catch (updateError) {
            handleFirestoreError(updateError, OperationType.UPDATE, `posts/${docRef.id}`);
          }
          showToast(`Post saved locally, but failed to reach n8n webhook: ${e instanceof Error ? e.message : 'Unknown error'}. Please check your n8n URL and connection.`, 'error');
          setIsSubmitting(false);
          return; // Don't clear form so user can retry
        }
      }

      setContent('');
      setSelectedPlatforms([]);
      setScheduleDate('');
      setScheduleTime('');
      setPostMediaAssets([]);
      setKeywords('');
      setTrends('');
      setIsReel(false);
      showToast(status === 'scheduled' ? 'Post scheduled successfully!' : status === 'published' ? 'Post marked as published!' : 'Draft saved successfully!', 'success');
    } catch (error) {
      console.error("Error saving post:", error);
      showToast('Error while saving post to database.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveAutomationSettings = async () => {
    setIsSavingPersona(true);
    try {
      const settingsData = {
        workspaceId: activeWorkspace,
        autoReplyEnabled,
        aiPersona,
        ghlApiKey,
        ghlLocationId,
        connectedPlatforms,
        oauthConnections,
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'automationSettings', activeWorkspace), settingsData);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `automationSettings/${activeWorkspace}`);
    } finally {
      setIsSavingPersona(false);
    }
  };

  const handleReplyToComment = async (commentId: string, replyText: string) => {
    try {
      const comment = comments.find(c => c.id === commentId);
      if (!comment) return;

      // Update Firebase
      try {
        await updateDoc(doc(db, 'comments', commentId), {
          status: 'replied'
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `comments/${commentId}`);
        return;
      }

      // Forward to n8n
      if (n8nWebhookUrl) {
        try {
          await fetch(n8nWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'post_reply',
              workspaceId: activeWorkspace,
              commentId: commentId,
              platform: comment.platform,
              originalText: comment.text,
              replyText: replyText
            })
          });
        } catch (e) {
          console.error("Failed to forward reply to n8n", e);
        }
      }
    } catch (error) {
      console.error("Failed to reply to comment:", error);
    }
  };

  const generateAIReply = async (commentId: string, commentText: string) => {
    setReplyingToCommentId(commentId);
    try {
      const prompt = `You are an AI assistant managing a social media account. 
${aiPersona ? `Here is your persona/instructions: ${aiPersona}` : 'Be helpful, friendly, and concise.'}

Please write a short, engaging reply to the following user comment:
"${commentText}"`;

      let generatedReply = '';

      if (aiProvider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
        });
        if (response.text) generatedReply = response.text;
      } else if (aiProvider === 'ollama') {
        const response = await fetch(`${ollamaEndpoint.replace(/\/$/, '')}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: ollamaModel,
            prompt: prompt,
            stream: false
          })
        });
        if (!response.ok) throw new Error(`Ollama request failed`);
        const data = await response.json();
        if (data.response) generatedReply = data.response;
      } else if (aiProvider === 'openrouter') {
        if (!openRouterApiKey) {
          showToast("Please enter your OpenRouter API Key in settings.", 'error');
          setReplyingToCommentId(null);
          return;
        }
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openRouterApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.href,
            'X-Title': 'SocialSync',
          },
          body: JSON.stringify({
            model: openRouterModel,
            messages: [{ role: 'user', content: prompt }],
          })
        });
        if (!response.ok) throw new Error(`OpenRouter request failed`);
        const data = await response.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
          generatedReply = data.choices[0].message.content;
        }
      } else if (aiProvider === 'groq') {
        if (!groqApiKey) {
          showToast("Please enter your Groq API Key in settings.", 'error');
          setReplyingToCommentId(null);
          return;
        }
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: groqModel,
            messages: [{ role: 'user', content: prompt }],
          })
        });
        if (!response.ok) throw new Error(`Groq request failed`);
        const data = await response.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
          generatedReply = data.choices[0].message.content;
        }
      }

      if (generatedReply) {
        await handleReplyToComment(commentId, generatedReply);
      }
    } catch (error) {
      console.error("Error generating AI reply:", error);
      showToast("Failed to generate AI reply. Check your AI provider settings.", 'error');
    } finally {
      setReplyingToCommentId(null);
    }
  };

  const toggleAccountConnection = async (platform: Platform) => {
    const newPlatforms = connectedPlatforms.includes(platform)
      ? connectedPlatforms.filter(p => p !== platform)
      : [...connectedPlatforms, platform];
    
    setConnectedPlatforms(newPlatforms);
    
    if (!connectedPlatforms.includes(platform)) {
      showToast(`${platformConfig[platform].name} has been enabled for this workspace.\n\nNote: If you are using n8n for publishing, please ensure your n8n workflow is authenticated and configured to handle posts for ${platformConfig[platform].name}.`, 'info');
    }

    try {
      await setDoc(doc(db, 'automationSettings', activeWorkspace), {
        workspaceId: activeWorkspace,
        autoReplyEnabled,
        aiPersona,
        ghlApiKey,
        ghlLocationId,
        connectedPlatforms: newPlatforms,
        oauthConnections,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      console.error("Failed to update connected platforms:", error);
    }
  };

  const handleOAuthConnect = async (platform: Platform) => {
    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    
    try {
      const response = await fetch(`/api/auth/${platform}/login?workspaceId=${activeWorkspace}`);
      if (!response.ok) throw new Error('Failed to get auth URL');
      const { url } = await response.json();
      
      window.open(
        url,
        'OAuth',
        `width=${width},height=${height},left=${left},top=${top}`
      );
    } catch (error) {
      console.error('OAuth error:', error);
      showToast('Failed to initiate connection. Please try again.', 'error');
    }
  };

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_SUCCESS') {
        const { platform, workspaceId, data } = event.data;
        if (workspaceId === activeWorkspace) {
           const newConnections = { ...oauthConnections, [platform]: data };
           setOauthConnections(newConnections);
           const newPlatforms = connectedPlatforms.includes(platform as Platform) ? connectedPlatforms : [...connectedPlatforms, platform as Platform];
           setConnectedPlatforms(newPlatforms);
           
           try {
             await setDoc(doc(db, 'automationSettings', activeWorkspace), {
               oauthConnections: newConnections,
               connectedPlatforms: newPlatforms
             }, { merge: true });
             showToast(`Successfully connected ${platformConfig[platform as Platform]?.name || platform}!`, 'success');
           } catch (error) {
             console.error("Failed to save oauth connection:", error);
           }
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [activeWorkspace, oauthConnections, connectedPlatforms]);

  const platformConfig: Record<Platform, { icon: any, color: string, name: string }> = {
    twitter: { icon: Twitter, color: 'bg-sky-500', name: 'X (Twitter)' },
    facebook: { icon: Facebook, color: 'bg-blue-600', name: 'Facebook' },
    instagram: { icon: Instagram, color: 'bg-pink-600', name: 'Instagram' },
    linkedin: { icon: Linkedin, color: 'bg-blue-700', name: 'LinkedIn' },
    tiktok: { icon: Music, color: 'bg-black', name: 'TikTok' },
    pinterest: { icon: Pin, color: 'bg-red-600', name: 'Pinterest' },
    youtube: { icon: Youtube, color: 'bg-red-500', name: 'YouTube' },
    reddit: { icon: MessageSquare, color: 'bg-orange-500', name: 'Reddit' },
    telegram: { icon: Send, color: 'bg-sky-400', name: 'Telegram' },
    wordpress: { icon: FileText, color: 'bg-blue-800', name: 'WordPress' },
    ghl: { icon: Megaphone, color: 'bg-blue-500', name: 'GoHighLevel' },
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Share2 className="w-8 h-8 text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to SocialSync</h1>
          <p className="text-gray-500 mb-8">Sign in to manage your workspaces, schedule posts, and automate your social media.</p>
          <button 
            onClick={() => { setShowLoginForm(true); }}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex text-gray-900 font-sans">
      {/* Media Library Modal */}
      {isMediaLibraryOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-xl font-display font-semibold text-gray-800 flex items-center">
                <Library className="w-6 h-6 mr-2 text-indigo-600" />
                Media Library
              </h2>
              <button 
                onClick={() => setIsMediaLibraryOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {mediaAssets.length === 0 ? (
                <EmptyState 
                  icon={Library} 
                  title="Your media library is empty." 
                  description="Generate images with AI and save them here."
                />
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {mediaAssets.map((asset) => (
                    <div key={asset.id} className="group relative aspect-square rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                      <img src={asset.url} alt={asset.name} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-4">
                        <button
                          onClick={() => {
                            setPostMediaAssets(prev => [...prev, { url: asset.url, type: 'image' }]);
                            setIsMediaLibraryOpen(false);
                          }}
                          className="bg-white text-gray-900 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors w-full mb-2"
                        >
                          Use in Post
                        </button>
                        <button
                          onClick={async () => {
                            if (window.confirm('Are you sure you want to delete this asset?')) {
                              try {
                                await deleteDoc(doc(db, 'mediaAssets', asset.id));
                              } catch (error) {
                                console.error("Failed to delete asset:", error);
                              }
                            }
                          }}
                          className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors w-full"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-800">App Settings</h2>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">AI Provider</label>
                <select 
                  value={aiProvider} 
                  onChange={(e) => setAiProvider(e.target.value as 'gemini' | 'ollama' | 'openrouter' | 'groq')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="gemini">Google Gemini (Cloud)</option>
                  <option value="ollama">Ollama (Local/VPS)</option>
                  <option value="openrouter">OpenRouter (Free/Paid Models)</option>
                  <option value="groq">Groq (Fast Inference)</option>
                </select>
              </div>

              {aiProvider === 'ollama' && (
                <div className="space-y-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ollama Endpoint URL</label>
                    <input 
                      type="text" 
                      value={ollamaEndpoint}
                      onChange={(e) => setOllamaEndpoint(e.target.value)}
                      placeholder="http://your-vps-ip:11434"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">Make sure your VPS firewall allows traffic to this port.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Model Name</label>
                    <input 
                      type="text" 
                      value={ollamaModel}
                      onChange={(e) => setOllamaModel(e.target.value)}
                      placeholder="llama3"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>
              )}

              {aiProvider === 'openrouter' && (
                <div className="space-y-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">OpenRouter API Key</label>
                    <input 
                      type="password" 
                      value={openRouterApiKey}
                      onChange={(e) => setOpenRouterApiKey(e.target.value)}
                      placeholder="sk-or-v1-..."
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Model Name</label>
                    <input 
                      type="text" 
                      value={openRouterModel}
                      onChange={(e) => setOpenRouterModel(e.target.value)}
                      placeholder="meta-llama/llama-3-8b-instruct:free"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">Use models with the ":free" suffix for free OpenRouter models.</p>
                  </div>
                </div>
              )}

              {aiProvider === 'groq' && (
                <div className="space-y-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Groq API Key</label>
                    <input 
                      type="password" 
                      value={groqApiKey}
                      onChange={(e) => setGroqApiKey(e.target.value)}
                      placeholder="gsk_..."
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Model Name</label>
                    <input 
                      type="text" 
                      value={groqModel}
                      onChange={(e) => setGroqModel(e.target.value)}
                      placeholder="llama3-8b-8192"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">e.g., llama3-8b-8192, llama3-70b-8192, mixtral-8x7b-32768</p>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-gray-200">
                <label className="block text-sm font-medium text-gray-700 mb-1">Workspace Timezone</label>
                <select 
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  {Intl.supportedValuesOf('timeZone').map(tz => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <label className="block text-sm font-medium text-gray-700 mb-1">n8n Webhook URL (Optional)</label>
                <p className="text-xs text-gray-500 mb-2">Leave blank to use the app independently without n8n automations.</p>
                <input 
                  type="text" 
                  value={n8nWebhookUrl}
                  onChange={(e) => setN8nWebhookUrl(e.target.value)}
                  placeholder="https://n8n.aisetuppros.com/webhook/..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">If configured, scheduled posts will be automatically forwarded to this n8n webhook for execution.</p>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Developer API</h3>
                <p className="text-xs text-gray-500 mb-3">Generate an API key to allow external tools (like your AI assistant or n8n) to authenticate and interact with this workspace.</p>
                
                {generatedApiKey ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-sm text-green-800 font-medium mb-2">API Key Generated!</p>
                    <p className="text-xs text-green-700 mb-3">Please copy this key now. You won't be able to see it again.</p>
                    <div className="flex items-center bg-white border border-green-300 rounded p-2">
                      <code className="text-sm text-gray-800 flex-1 break-all">{generatedApiKey}</code>
                      <button 
                        onClick={() => navigator.clipboard.writeText(generatedApiKey)}
                        className="ml-2 text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                ) : (
                  <button 
                    onClick={handleGenerateApiKey}
                    disabled={isGeneratingApiKey}
                    className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center transition-colors disabled:opacity-50"
                  >
                    {isGeneratingApiKey ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Settings className="w-4 h-4 mr-2" />}
                    Generate New API Key
                  </button>
                )}
              </div>

              <div className="pt-4 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">GoHighLevel (GHL) Integration</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">GHL API Key</label>
                    <input 
                      type="password" 
                      value={ghlApiKey}
                      onChange={(e) => setGhlApiKey(e.target.value)}
                      placeholder="Paste GHL API Key here"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Location ID</label>
                    <input 
                      type="text" 
                      value={ghlLocationId}
                      onChange={(e) => setGhlLocationId(e.target.value)}
                      placeholder="e.g. abc123xyz"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">This allows n8n to route data to the correct GHL sub-account for this workspace.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <button 
                onClick={() => {
                  saveAutomationSettings();
                  setIsSettingsOpen(false);
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg font-medium transition-colors"
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {isPreviewOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-800">Post Preview</h2>
              <button 
                onClick={() => setIsPreviewOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-6">
              {selectedPlatforms.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Select platforms to see previews.</p>
              ) : (
                selectedPlatforms.map(platform => {
                  const config = platformConfig[platform];
                  const Icon = config.icon;
                  return (
                    <div key={platform} className="border border-gray-200 rounded-xl overflow-hidden">
                      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center">
                        <div className={`${config.color} w-6 h-6 rounded-full flex items-center justify-center text-white mr-2`}>
                          <Icon className="w-3 h-3" />
                        </div>
                        <span className="text-sm font-medium text-gray-700">{config.name} Preview</span>
                      </div>
                      <div className="p-4">
                        <div className="flex items-start">
                          <div className="w-10 h-10 rounded-full bg-gray-200 mr-3 flex-shrink-0"></div>
                          <div className="flex-1">
                            <div className="h-3 w-24 bg-gray-200 rounded mb-2"></div>
                            <p className="text-sm text-gray-800 whitespace-pre-wrap">{content || 'Your post content will appear here...'}</p>
                            {postMediaAssets.length > 0 && (
                              <div className="mt-3 grid grid-cols-2 gap-2">
                                {postMediaAssets.map((asset, i) => (
                                  asset.type === 'video' ? (
                                    <video key={i} src={asset.url} className="rounded-lg w-full h-32 object-cover border border-gray-200" controls />
                                  ) : (
                                    <img key={i} src={asset.url} alt="Media" className="rounded-lg w-full h-32 object-cover border border-gray-200" />
                                  )
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <Share2 className="w-6 h-6 text-indigo-600 mr-2" />
          <span className="text-xl font-display font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">
            SocialSync
          </span>
          <button 
            className="ml-auto md:hidden text-gray-500"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Workspace Switcher */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 relative">
          <button 
            onClick={() => setIsWorkspaceDropdownOpen(!isWorkspaceDropdownOpen)}
            className="w-full flex items-center justify-between bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600 px-3 py-2 rounded-lg transition-colors"
          >
            <div className="flex items-center overflow-hidden">
              <Building2 className="w-4 h-4 text-gray-500 dark:text-gray-400 mr-2 flex-shrink-0" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
                {workspaces.find(w => w.id === activeWorkspace)?.name || 'Loading...'}
              </span>
            </div>
            <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />
          </button>
          
          {isWorkspaceDropdownOpen && (
            <div className="absolute top-full left-4 right-4 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 py-1">
              {workspaces.map(ws => (
                <button
                  key={ws.id}
                  onClick={() => {
                    setActiveWorkspace(ws.id);
                    setIsWorkspaceDropdownOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm ${activeWorkspace === ws.id ? 'bg-indigo-50 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-200 font-medium' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                >
                  {ws.name}
                </button>
              ))}
              <div className="border-t border-gray-100 mt-1 pt-1">
                {isCreatingWorkspace ? (
                  <div className="px-4 py-2">
                    <input 
                      type="text" 
                      value={newWorkspaceName}
                      onChange={(e) => setNewWorkspaceName(e.target.value)}
                      placeholder="Workspace Name"
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm mb-2"
                      autoFocus
                    />
                    <div className="flex justify-end space-x-2">
                      <button onClick={() => setIsCreatingWorkspace(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                      <button onClick={handleCreateWorkspace} className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700">Create</button>
                    </div>
                  </div>
                ) : (
                  <button 
                    onClick={() => setIsCreatingWorkspace(true)}
                    className="w-full text-left px-4 py-2 text-sm text-indigo-600 hover:bg-indigo-50 font-medium flex items-center"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create Workspace
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          <button 
            onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center px-3 py-2.5 rounded-lg font-medium transition-colors ${activeTab === 'dashboard' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-100'}`}
          >
            <LayoutDashboard className={`w-5 h-5 mr-3 ${activeTab === 'dashboard' ? 'text-indigo-600' : 'text-gray-400'}`} />
            Dashboard
          </button>
          <button 
            onClick={() => { setActiveTab('engagement'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center px-3 py-2.5 rounded-lg font-medium transition-colors ${activeTab === 'engagement' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-100'}`}
          >
            <MessageCircle className={`w-5 h-5 mr-3 ${activeTab === 'engagement' ? 'text-indigo-600' : 'text-gray-400'}`} />
            Engagement Inbox
          </button>
          <button 
            onClick={() => { setActiveTab('accounts'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center px-3 py-2.5 rounded-lg font-medium transition-colors ${activeTab === 'accounts' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-100'}`}
          >
            <Share2 className={`w-5 h-5 mr-3 ${activeTab === 'accounts' ? 'text-indigo-600' : 'text-gray-400'}`} />
            Accounts
          </button>
          <button 
            onClick={() => { setActiveTab('calendar'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center px-3 py-2.5 rounded-lg font-medium transition-colors ${activeTab === 'calendar' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-100'}`}
          >
            <Calendar className={`w-5 h-5 mr-3 ${activeTab === 'calendar' ? 'text-indigo-600' : 'text-gray-400'}`} />
            Calendar
          </button>
          <button 
            onClick={() => { setActiveTab('media'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center px-3 py-2.5 rounded-lg font-medium transition-colors ${activeTab === 'media' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-100'}`}
          >
            <Library className={`w-5 h-5 mr-3 ${activeTab === 'media' ? 'text-indigo-600' : 'text-gray-400'}`} />
            Media Library
          </button>
          <button 
            onClick={() => { setIsSettingsOpen(true); setIsMobileMenuOpen(false); }}
            className="w-full flex items-center px-3 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg font-medium transition-colors"
          >
            <Settings className="w-5 h-5 mr-3 text-gray-400" />
            Settings
          </button>
        </nav>
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <img src={user.photoURL || ''} alt="Profile" className="w-8 h-8 rounded-full bg-indigo-100" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-700 truncate w-24">{user.displayName}</p>
                <p className="text-xs text-gray-500">Pro Plan</p>
              </div>
            </div>
            <button onClick={handleSimpleLogout} className="text-gray-400 hover:text-red-500 transition-colors" title="Sign Out">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto w-full relative bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        {/* Mobile Menu Button */}
        <button 
          className="md:hidden fixed bottom-6 right-6 z-50 bg-indigo-600 text-white p-4 rounded-full shadow-lg hover:bg-indigo-700 transition-colors"
          onClick={() => setIsMobileMenuOpen(true)}
        >
          <LayoutDashboard className="w-6 h-6" />
        </button>

        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-8 sticky top-0 z-30">
          <h1 className="text-xl sm:text-2xl font-display font-semibold text-gray-800 truncate pr-4">
            {activeTab === 'dashboard' ? 'Dashboard' : activeTab === 'accounts' ? 'Connected Accounts' : activeTab === 'calendar' ? 'Content Calendar' : activeTab === 'media' ? 'Media Library' : 'Engagement & Auto-Replies'}
          </h1>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
            >
              {darkMode ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
            </button>
            <div className="relative">
              <button className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors">
                <AlertCircle className="w-6 h-6" />
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-gray-900"></span>
                )}
              </button>
            </div>
            {activeTab !== 'accounts' && (
              <button 
                onClick={() => setActiveTab('accounts')}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 sm:px-4 py-2 rounded-lg text-sm sm:text-base font-medium flex items-center transition-colors shadow-sm whitespace-nowrap"
              >
                <Plus className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Connect Account</span>
              </button>
            )}
          </div>
        </header>

        <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-8 pb-24 md:pb-8">
          
          {activeTab === 'accounts' ? (
            <div className="space-y-6">
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
                <h2 className="text-xl font-semibold text-gray-800 mb-2">Manage Connections</h2>
                <div className="text-gray-600 mb-8 max-w-3xl space-y-4">
                  <p>
                    Toggle the platforms below to enable them in your post composer for this workspace. 
                  </p>
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-sm text-blue-800">
                    <strong>How posting works:</strong>
                    <ul className="list-disc ml-5 mt-2 space-y-1">
                      <li><strong>Manual Mode (Default):</strong> Use this app to plan, write, and generate AI content. Then copy/paste your posts to the actual social networks.</li>
                      <li><strong>Automated Mode (via n8n):</strong> If you want auto-publishing, you must connect your actual social media accounts <em>inside your n8n instance</em>. Then, add your n8n Webhook URL in this app's Settings. This app will send the post data to n8n, and n8n will publish it for you.</li>
                    </ul>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {(Object.keys(platformConfig) as Platform[]).map(platform => {
                    const config = platformConfig[platform];
                    const Icon = config.icon;
                    const isConnected = connectedPlatforms.includes(platform);
                    const oauthData = oauthConnections[platform];
                    
                    return (
                      <div key={platform} className="border border-gray-200 rounded-xl p-5 flex flex-col justify-between bg-gray-50 hover:bg-gray-100 transition-colors gap-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            <div className={`${config.color} w-12 h-12 rounded-full flex items-center justify-center text-white mr-4 shadow-sm`}>
                              <Icon className="w-6 h-6" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{config.name}</p>
                              <p className="text-xs text-gray-500 mt-0.5">{isConnected ? 'Enabled' : 'Disabled'}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => toggleAccountConnection(platform)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              isConnected 
                                ? 'bg-red-50 text-red-600 hover:bg-red-100' 
                                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 shadow-sm'
                            }`}
                          >
                            {isConnected ? 'Disable' : 'Enable'}
                          </button>
                        </div>
                        
                        {/* OAuth Connection Area */}
                        <div className="pt-3 border-t border-gray-200 flex items-center justify-between">
                          {oauthData ? (
                            <div className="flex items-center text-sm text-green-700 font-medium">
                              <div className="w-2 h-2 rounded-full bg-green-500 mr-2"></div>
                              Connected as @{oauthData.username}
                            </div>
                          ) : (
                            <div className="text-sm text-gray-500">Not connected natively</div>
                          )}
                          
                          {platform === 'twitter' && (
                            <button
                              onClick={() => handleOAuthConnect(platform)}
                              className="text-xs font-medium text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors"
                            >
                              {oauthData ? 'Reconnect' : 'Connect Account'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : activeTab === 'dashboard' ? (
            <>
              {/* Composer Section */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-display font-semibold text-gray-800">Create New Post</h2>
                <div className="flex bg-gray-100 p-1 rounded-lg">
                  <button
                    onClick={() => setComposerMode('write')}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${composerMode === 'write' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Write from Scratch
                  </button>
                  <button
                    onClick={() => setComposerMode('repurpose')}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${composerMode === 'repurpose' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Repurpose Content
                  </button>
                </div>
              </div>
              
              {composerMode === 'repurpose' ? (
                <div className="space-y-4">
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-4">
                    <h3 className="text-indigo-800 font-medium flex items-center mb-2">
                      <Sparkles className="w-5 h-5 mr-2" />
                      Content Repurposing Engine
                    </h3>
                    <p className="text-indigo-600 text-sm">
                      Paste a URL (like a blog post or news article) or a long block of text. Our AI will automatically generate 3 distinct social media posts tailored for different platforms and save them to your Drafts.
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Source URL or Text</label>
                    <textarea
                      value={repurposeSource}
                      onChange={(e) => setRepurposeSource(e.target.value)}
                      placeholder="https://example.com/blog-post OR paste your long text here..."
                      className="w-full border border-gray-300 rounded-xl p-4 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none transition-all min-h-[120px]"
                    />
                  </div>
                  
                  <div className="flex justify-end">
                    <button
                      onClick={handleRepurpose}
                      disabled={isRepurposing || !repurposeSource.trim()}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-medium flex items-center transition-colors shadow-sm disabled:opacity-50"
                    >
                      {isRepurposing ? (
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="w-5 h-5 mr-2" />
                      )}
                      Generate Drafts
                    </button>
                  </div>
                </div>
              ) : (
                <>
              {/* Platform Selector */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Platforms</label>
                <div className="flex flex-wrap gap-3">
                  {(Object.keys(platformConfig) as Platform[]).map((platform) => {
                    const config = platformConfig[platform];
                    const Icon = config.icon;
                    const isSelected = selectedPlatforms.includes(platform);
                    
                    return (
                      <button
                        key={platform}
                        onClick={() => togglePlatform(platform)}
                        className={`flex items-center px-4 py-2 rounded-full border transition-all ${
                          isSelected 
                            ? `${config.color} border-transparent text-white shadow-md transform scale-105` 
                            : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <Icon className="w-4 h-4 mr-2" />
                        <span className="text-sm font-medium">{config.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Text Area */}
              <div className="mb-4">
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="What do you want to share?"
                  className="w-full h-32 p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition-all"
                />
              </div>

              {/* AI Improvement Options */}
              <div className="flex flex-wrap gap-2 mb-6">
                <button
                  onClick={() => improveContent('rephrase')}
                  disabled={isImproving || !content.trim()}
                  className="flex items-center px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium hover:bg-indigo-100 transition-colors disabled:opacity-50"
                  title="Rephrase content to make it more engaging"
                >
                  {isImproving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Wand2 className="w-3 h-3 mr-1" />}
                  Rephrase
                </button>
                <button
                  onClick={() => improveContent('shorten')}
                  disabled={isImproving || !content.trim()}
                  className="flex items-center px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium hover:bg-indigo-100 transition-colors disabled:opacity-50"
                  title="Make content more concise and punchy"
                >
                  {isImproving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                  Shorten
                </button>
                <button
                  onClick={() => improveContent('expand')}
                  disabled={isImproving || !content.trim()}
                  className="flex items-center px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium hover:bg-indigo-100 transition-colors disabled:opacity-50"
                  title="Add more detail and information"
                >
                  {isImproving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Plus className="w-3 h-3 mr-1" />}
                  Expand
                </button>
                <button
                  onClick={() => generateHashtags()}
                  disabled={isImproving || !content.trim()}
                  className="flex items-center px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium hover:bg-indigo-100 transition-colors disabled:opacity-50"
                  title="Generate relevant hashtags"
                >
                  {isImproving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Hash className="w-3 h-3 mr-1" />}
                  Hashtags
                </button>
              </div>

              {/* Keywords, Trends, and Tone */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Brand Tone</label>
                  <select 
                    value={postTone}
                    onChange={(e) => setPostTone(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                  >
                    <option value="Professional">Professional</option>
                    <option value="Casual">Casual</option>
                    <option value="Humorous">Humorous</option>
                    <option value="Educational">Educational</option>
                    <option value="Inspirational">Inspirational</option>
                    <option value="Snarky">Snarky</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Keywords</label>
                  <input 
                    type="text" 
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    placeholder="e.g., AI, marketing, growth"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Current Trends</label>
                  <input 
                    type="text" 
                    value={trends}
                    onChange={(e) => setTrends(e.target.value)}
                    placeholder="e.g., #TechTuesday, minimalist design"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              {/* Media Previews */}
              {postMediaAssets.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {postMediaAssets.map((asset, index) => (
                    <div key={index} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200">
                      {asset.type === 'video' ? (
                        <video src={asset.url} className="w-full h-full object-cover" />
                      ) : (
                        <img src={asset.url} alt="Uploaded media" className="w-full h-full object-cover" />
                      )}
                      <button 
                        onClick={() => setPostMediaAssets(prev => prev.filter((_, i) => i !== index))}
                        className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1 hover:bg-black/70"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {isUploading && (
                    <div className="w-20 h-20 rounded-lg border border-gray-200 flex items-center justify-center bg-gray-50">
                      <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                    </div>
                  )}
                </div>
              )}

              {/* Media Upload & AI Actions */}
              <div className="flex flex-col mb-6 gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center space-x-4">
                    <label className="flex items-center text-gray-500 hover:text-indigo-600 transition-colors px-3 py-2 rounded-lg hover:bg-indigo-50 cursor-pointer">
                      <ImageIcon className="w-5 h-5 mr-2" />
                      <span className="text-sm font-medium">Add Media</span>
                      <input type="file" multiple accept="image/*,video/*" className="hidden" onChange={handleMediaUpload} disabled={isUploading} />
                    </label>
                    <button 
                      onClick={() => setIsMediaLibraryOpen(true)}
                      className="flex items-center text-gray-500 hover:text-indigo-600 transition-colors px-3 py-2 rounded-lg hover:bg-indigo-50"
                    >
                      <Library className="w-5 h-5 mr-2" />
                      <span className="text-sm font-medium">Library</span>
                    </button>
                    <button 
                      onClick={generateAIContent}
                      disabled={isGenerating}
                      className="flex items-center text-purple-600 hover:text-purple-700 transition-colors px-3 py-2 rounded-lg hover:bg-purple-50 disabled:opacity-50"
                    >
                      {isGenerating ? (
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="w-5 h-5 mr-2" />
                      )}
                      <span className="text-sm font-medium">
                        {isGenerating ? 'Generating...' : content.trim() ? 'AI Enhance' : 'AI Suggestion'}
                      </span>
                    </button>
                  </div>
                  
                  {selectedPlatforms.includes('instagram') && (
                    <label className="flex items-center cursor-pointer bg-pink-50 text-pink-700 px-3 py-2 rounded-lg border border-pink-100">
                      <input 
                        type="checkbox" 
                        className="form-checkbox h-4 w-4 text-pink-600 rounded border-pink-300 focus:ring-pink-500 mr-2"
                        checked={isReel}
                        onChange={(e) => setIsReel(e.target.checked)}
                      />
                      <span className="text-sm font-medium">Post as Instagram Reel</span>
                    </label>
                  )}
                </div>

                {/* AI Image Generation */}
                <div className="flex flex-col space-y-3 bg-gray-50 p-3 rounded-xl border border-gray-100">
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      placeholder="Describe an image to generate with AI..."
                      value={imagePrompt}
                      onChange={(e) => setImagePrompt(e.target.value)}
                      className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleGenerateImage();
                        }
                      }}
                    />
                    <button
                      onClick={handleGenerateImage}
                      disabled={isGeneratingImage || !imagePrompt.trim()}
                      className="bg-purple-100 hover:bg-purple-200 text-purple-700 px-4 py-2 rounded-lg font-medium text-sm flex items-center transition-colors disabled:opacity-50"
                    >
                      {isGeneratingImage ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4 mr-2" />
                      )}
                      Generate
                    </button>
                  </div>
                  
                  {generatedImagePreview && (
                    <div className="p-3 bg-white border border-purple-100 rounded-lg flex flex-col items-center">
                      <img src={generatedImagePreview} alt="Generated preview" className="w-full max-w-sm rounded-lg shadow-sm mb-3 object-contain max-h-64" />
                      <div className="flex space-x-2 w-full max-w-sm">
                        <button 
                          onClick={() => {
                            setPostMediaAssets(prev => [...prev, { url: generatedImagePreview, type: 'image' }]);
                            setGeneratedImagePreview(null);
                            setImagePrompt('');
                          }}
                          className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg text-sm font-medium transition-colors"
                        >
                          Attach to Post
                        </button>
                        <button 
                          onClick={() => {
                            handleSaveToLibrary(generatedImagePreview);
                            setGeneratedImagePreview(null);
                            setImagePrompt('');
                          }}
                          className="flex-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 py-2 rounded-lg text-sm font-medium transition-colors"
                        >
                          Save to Library
                        </button>
                        <button 
                          onClick={() => setGeneratedImagePreview(null)}
                          className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 rounded-lg text-sm font-medium transition-colors"
                        >
                          Discard
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Submission Errors */}
              {submissionErrors && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
                  <h3 className="text-sm font-semibold text-red-800 mb-2 flex items-center">
                    <AlertCircle className="w-4 h-4 mr-2" />
                    Failed to schedule on some platforms:
                  </h3>
                  <ul className="list-disc pl-5 space-y-1">
                    {Object.entries(submissionErrors).map(([platform, error]) => (
                      <li key={platform} className="text-sm text-red-700">
                        <span className="font-medium capitalize">{platform}:</span> {error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Scheduling & Action */}
              <div className="pt-4 border-t border-gray-100">
                {!n8nWebhookUrl && (
                  <p className="text-xs text-amber-600 mb-3 flex items-center">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Note: Without an n8n webhook configured, scheduling will only save the post locally. You will need to manually publish it.
                  </p>
                )}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Clock className="w-5 h-5 text-gray-400 hidden sm:block" />
                    <input 
                      type="date" 
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none flex-1 sm:flex-none"
                    />
                    <input 
                      type="time" 
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none flex-1 sm:flex-none"
                    />
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none flex-1 sm:flex-none"
                    >
                      {Intl.supportedValuesOf('timeZone').map(tz => (
                        <option key={tz} value={tz}>{tz}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                  <button 
                    onClick={() => setIsPreviewOpen(true)}
                    className="flex-1 sm:flex-none bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2.5 rounded-lg font-medium flex items-center justify-center transition-colors shadow-sm"
                  >
                    <Eye className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">Preview</span>
                  </button>
                  <button 
                    onClick={() => handleSchedule('draft')}
                    disabled={isSubmitting}
                    className="flex-1 sm:flex-none bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-lg font-medium flex items-center justify-center transition-colors shadow-sm disabled:opacity-50"
                  >
                    <Save className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">Draft</span>
                  </button>
                  <button 
                    onClick={() => handleSchedule('published')}
                    disabled={isSubmitting}
                    className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg font-medium flex items-center justify-center transition-colors shadow-sm disabled:opacity-50"
                  >
                    <Megaphone className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">Publish</span>
                  </button>
                  <button 
                    onClick={() => handleSchedule('scheduled')}
                    disabled={isSubmitting}
                    className="w-full sm:w-auto bg-gray-900 hover:bg-black text-white px-6 py-2.5 rounded-lg font-medium flex items-center justify-center transition-colors shadow-sm disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    {isSubmitting ? 'Scheduling...' : 'Schedule'}
                  </button>
                  </div>
                </div>
              </div>
              </>
              )}
            </div>
          </section>

          {/* Upcoming Posts Section */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-display font-semibold text-gray-800">Posts</h2>
              <div className="flex space-x-2 bg-gray-100 p-1 rounded-lg">
                <button 
                  onClick={() => setDashboardTab('scheduled')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${dashboardTab === 'scheduled' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Scheduled
                </button>
                <button 
                  onClick={() => setDashboardTab('published')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${dashboardTab === 'published' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Published
                </button>
                <button 
                  onClick={() => setDashboardTab('drafts')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${dashboardTab === 'drafts' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Drafts
                </button>
                <button 
                  onClick={() => setDashboardTab('calendar')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${dashboardTab === 'calendar' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Calendar
                </button>
              </div>
            </div>
            
            <div className="space-y-4">
              {isLoadingPosts ? (
                <div className="space-y-4">
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : dashboardTab === 'calendar' ? (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <div className="grid grid-cols-7 gap-2 mb-2">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                      <div key={day} className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider py-2">
                        {day}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-2">
                    {(() => {
                      const today = new Date();
                      const year = today.getFullYear();
                      const month = today.getMonth();
                      const daysInMonth = new Date(year, month + 1, 0).getDate();
                      const firstDayOfMonth = new Date(year, month, 1).getDay();
                      
                      const days = [];
                      for (let i = 0; i < firstDayOfMonth; i++) {
                        days.push(<div key={`empty-${i}`} className="h-24 bg-gray-50 rounded-lg border border-gray-100"></div>);
                      }
                      
                      for (let i = 1; i <= daysInMonth; i++) {
                        const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                        const dayPosts = posts.filter(p => p.scheduledFor && p.scheduledFor.startsWith(dateString));
                        
                        days.push(
                          <div key={i} className="h-24 bg-white rounded-lg border border-gray-200 p-1 overflow-y-auto hover:border-indigo-300 transition-colors">
                            <div className="text-xs font-medium text-gray-500 mb-1 px-1">{i}</div>
                            <div className="space-y-1">
                              {dayPosts.map(post => (
                                <div key={post.id} className={`text-[10px] p-1 rounded truncate cursor-pointer ${post.status === 'published' ? 'bg-green-100 text-green-800' : post.status === 'scheduled' ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-800'}`} title={post.content}>
                                  {post.content}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }
                      return days;
                    })()}
                  </div>
                </div>
              ) : posts.filter(p => dashboardTab === 'drafts' ? p.status === 'draft' : dashboardTab === 'published' ? p.status === 'published' : p.status === 'scheduled').length === 0 ? (
                <EmptyState 
                  icon={Calendar} 
                  title={`No ${dashboardTab} posts`} 
                  description={`You don't have any ${dashboardTab} posts yet. Start creating content to see them here.`}
                />
              ) : (
                  <div>
                    {renderBulkActions()}
                    {posts.filter(p => dashboardTab === 'drafts' ? p.status === 'draft' : dashboardTab === 'published' ? p.status === 'published' : p.status === 'scheduled').map(post => (
                    <div key={post.id} className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row gap-4 hover:shadow-md transition-shadow">
                      <div className="flex items-center">
                        <input 
                          type="checkbox" 
                          checked={selectedPostIds.includes(post.id)}
                          onChange={() => togglePostSelection(post.id)}
                          className="w-5 h-5 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="flex-1">
                        <p className="text-gray-800 dark:text-gray-200 mb-3">{post.content}</p>
                      {post.postMediaAssets && post.postMediaAssets.length > 0 && (
                        <div className="flex gap-2 mb-3">
                          {post.postMediaAssets.map((asset, i) => (
                            asset.type === 'video' ? (
                              <video key={i} src={asset.url} className="w-16 h-16 rounded-lg object-cover border border-gray-200" controls />
                            ) : (
                              <img key={i} src={asset.url} alt="Media" className="w-16 h-16 rounded-lg object-cover border border-gray-200" />
                            )
                          ))}
                        </div>
                      )}
                      {post.status === 'published' && post.analytics && (
                        <div className="flex gap-4 mt-3 text-sm text-gray-500">
                          <span className="flex items-center gap-1"><ThumbsUp className="w-4 h-4" /> {post.analytics.likes}</span>
                          <span className="flex items-center gap-1"><Share2 className="w-4 h-4" /> {post.analytics.shares}</span>
                          <span className="flex items-center gap-1"><MessageCircle className="w-4 h-4" /> {post.analytics.comments}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        {post.platforms.map(p => {
                          const config = platformConfig[p];
                          const Icon = config.icon;
                          return (
                            <div key={p} className="flex items-center gap-1" title={config.name}>
                              <div className={`${config.color} w-6 h-6 rounded-full flex items-center justify-center text-white`}>
                                <Icon className="w-3 h-3" />
                              </div>
                              <span className="text-xs text-gray-500">{config.name}</span>
                            </div>
                          );
                        })}
                        {post.isReel && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-pink-100 text-pink-800">
                            Reel
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="sm:text-right flex flex-col justify-between items-end">
                      <div className="flex items-center space-x-2 mb-2 sm:mb-0">
                        <select
                          value={post.status}
                          onChange={(e) => updatePostStatus(post, e.target.value as ScheduledPost['status'])}
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border-none cursor-pointer ${
                            post.status === 'published' ? 'bg-green-100 text-green-800' : 
                            post.status === 'draft' ? 'bg-gray-100 text-gray-800' : 
                            post.status === 'pending_approval' ? 'bg-blue-100 text-blue-800' :
                            'bg-amber-100 text-amber-800'
                          }`}
                        >
                          <option value="draft">Draft</option>
                          <option value="pending_approval">Pending Approval</option>
                          <option value="scheduled">Scheduled</option>
                          <option value="published">Published</option>
                          <option value="failed">Failed</option>
                        </select>
                        {post.status !== 'published' && (
                          <button 
                            onClick={() => handleMarkAsPublished(post.id)} 
                            className="text-indigo-600 hover:text-indigo-800 text-xs font-medium bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded transition-colors"
                            title="Mark as Published"
                          >
                            Publish
                          </button>
                        )}
                        {(userRole === 'admin' || userRole === 'editor') && (
                          <button onClick={() => handleDeletePost(post)} className="text-gray-400 hover:text-red-500 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {post.scheduledFor && (
                        <div className="text-sm text-gray-500 flex items-center sm:justify-end mt-2">
                          <Clock className="w-4 h-4 mr-1.5" />
                          {new Date(post.scheduledFor).toLocaleString([], {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              }
            </div>
          )}
        </div>
      </section>
    </>
    ) : activeTab === 'calendar' ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 h-[600px]">
            <h2 className="text-xl font-display font-semibold text-gray-800 mb-6">Content Calendar</h2>
            <BigCalendar
              localizer={localizer}
              events={posts.filter(p => p.scheduledFor).map(post => ({
                title: post.content.substring(0, 20) + '...',
                start: new Date(post.scheduledFor),
                end: new Date(post.scheduledFor),
                allDay: true,
                resource: post
              }))}
              startAccessor="start"
              endAccessor="end"
              style={{ height: 500 }}
            />
          </div>
        ) : activeTab === 'media' ? (
          <MediaLibrary workspaceId={activeWorkspace} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Inbox Column */}
            <div className="lg:col-span-2 space-y-4">
              <h2 className="text-lg font-display font-semibold text-gray-800 mb-4">Incoming Comments</h2>
              {isLoadingComments ? (
                <div className="space-y-4">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : comments.length === 0 ? (
                <EmptyState 
                  icon={MessageCircle} 
                  title="Inbox is zero!" 
                  description="You're all caught up. No new comments to review."
                />
              ) : (
                comments.map(comment => {
                    const config = platformConfig[comment.platform];
                    const Icon = config?.icon || MessageCircle;
                    return (
                      <div key={comment.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center">
                            <div className={`${config?.color || 'bg-gray-500'} w-8 h-8 rounded-full flex items-center justify-center text-white mr-3`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900">{comment.author}</p>
                              <p className="text-xs text-gray-500">{new Date(comment.timestamp).toLocaleString()}</p>
                            </div>
                          </div>
                          {comment.status === 'replied' && (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-green-100 text-green-800 text-xs font-medium">
                              Replied
                            </span>
                          )}
                        </div>
                        <p className="text-gray-800 mb-4">{comment.text}</p>
                        
                        {comment.status === 'pending' && (
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              placeholder="Type a manual reply..." 
                              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && e.currentTarget.value) {
                                  handleReplyToComment(comment.id, e.currentTarget.value);
                                }
                              }}
                            />
                            <button 
                              onClick={() => generateAIReply(comment.id, comment.text)}
                              disabled={replyingToCommentId === comment.id}
                              className="bg-purple-100 hover:bg-purple-200 text-purple-700 px-4 py-2 rounded-lg text-sm font-medium flex items-center transition-colors disabled:opacity-50"
                            >
                              {replyingToCommentId === comment.id ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <Sparkles className="w-4 h-4 mr-2" />
                              )}
                              AI Reply
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Automation Settings Column */}
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-display font-semibold text-gray-800 flex items-center">
                      <Bot className="w-5 h-5 mr-2 text-indigo-600" />
                      Auto-Reply AI
                    </h2>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={autoReplyEnabled}
                        onChange={async (e) => {
                          const newValue = e.target.checked;
                          setAutoReplyEnabled(newValue);
                          try {
                            await setDoc(doc(db, 'automationSettings', activeWorkspace), {
                              workspaceId: activeWorkspace,
                              autoReplyEnabled: newValue,
                              aiPersona,
                              ghlApiKey,
                              ghlLocationId,
                              connectedPlatforms,
                              updatedAt: new Date().toISOString()
                            }, { merge: true });
                          } catch (error) {
                            console.error("Failed to save auto-reply toggle:", error);
                          }
                        }}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>

                  <p className="text-sm text-gray-600 mb-4">
                    When enabled, if you have n8n configured, it will automatically generate and post replies to new comments based on the persona below.
                  </p>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">AI Persona & Instructions</label>
                      <textarea
                        value={aiPersona}
                        onChange={(e) => setAiPersona(e.target.value)}
                        placeholder="e.g., You are a helpful customer support agent..."
                        className="w-full h-40 p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none text-sm"
                      />
                    </div>
                    <button 
                      onClick={saveAutomationSettings}
                      disabled={isSavingPersona}
                      className="w-full bg-gray-900 hover:bg-black text-white px-4 py-2.5 rounded-lg font-medium flex items-center justify-center transition-colors disabled:opacity-50"
                    >
                      {isSavingPersona ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : 'Save Instructions'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
      {/* Toast Notifications */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div 
            key={toast.id} 
            className={`pointer-events-auto flex items-center p-4 rounded-xl shadow-lg border animate-in slide-in-from-right-full duration-300 ${
              toast.type === 'success' ? 'bg-green-50 border-green-100 text-green-800' :
              toast.type === 'error' ? 'bg-red-50 border-red-100 text-red-800' :
              'bg-indigo-50 border-indigo-100 text-indigo-800'
            }`}
          >
            {toast.type === 'success' && <ThumbsUp className="w-5 h-5 mr-3" />}
            {toast.type === 'error' && <AlertCircle className="w-5 h-5 mr-3" />}
            {toast.type === 'info' && <Sparkles className="w-5 h-5 mr-3" />}
            <p className="text-sm font-medium">{toast.message}</p>
            <button 
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              className="ml-4 hover:opacity-70"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {postToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Post</h3>
            <p className="text-gray-600 mb-6">Are you sure you want to delete this post? This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setPostToDelete(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={confirmDelete} className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
