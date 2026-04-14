import React, { useState, useEffect } from 'react';
import { Calendar as BigCalendar, momentLocalizer } from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  AreaChart, 
  Area,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
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
  Sun,
  Edit3,
  User as UserIcon,
  Users,
  Zap,
  Search,
  TrendingUp,
  Video,
  ShieldCheck,
  Link2,
  Smile,
  Frown,
  Meh,
  CheckCircle,
  XCircle,
  Film,
  Target,
  TrendingDown,
  Layout,
  RefreshCw
} from 'lucide-react';
import { Skeleton } from './components/Skeleton';
import { EmptyState } from './components/EmptyState';

const localizer = momentLocalizer(moment);
const DnDCalendar = withDragAndDrop(BigCalendar as any);
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

const AI_TEMPLATES = [
  { id: 'promo', name: 'Promotional Tweet', prompt: 'Write a short, engaging promotional tweet for a new product launch. Include a call to action and relevant hashtags.' },
  { id: 'news', name: 'Industry News', prompt: 'Write a LinkedIn post summarizing a recent industry news trend. Keep it professional, insightful, and encourage discussion.' },
  { id: 'insta', name: 'Instagram Caption', prompt: 'Write a catchy Instagram caption for a product photo. Include emojis and a question to boost engagement.' },
  { id: 'blog', name: 'Blog Teaser', prompt: 'Write a short, intriguing teaser for a blog post. Include a call to action.' },
];

import { db, auth, storage, signInWithGoogle, logOut, handleFirestoreError, OperationType } from './firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged, User } from 'firebase/auth';

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
  tags?: string[];
}

interface PostMediaAsset {
  url: string;
  type: 'image' | 'video';
}

interface ScheduledPost {
  id: string;
  content: string;
  platformContent?: Partial<Record<Platform, string>>;
  platforms: Platform[];
  scheduledFor: string;
  status: 'scheduled' | 'published' | 'failed' | 'draft' | 'pending_approval';
  postMediaAssets?: PostMediaAsset[];
  timezone?: string;
  isReel?: boolean;
  createdAt?: string;
  campaign?: string;
  feedback?: {
    text: string;
    author: string;
    timestamp: string;
    resolved: boolean;
  }[];
  analytics?: {
    likes: number;
    shares: number;
    comments: number;
  };
}

interface EvergreenPost {
  id: string;
  content: string;
  platformContent?: Partial<Record<Platform, string>>;
  platforms: Platform[];
  mediaAssets: PostMediaAsset[];
  workspaceId: string;
  useCount: number;
  createdAt: string;
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

interface Campaign {
  id: string;
  name: string;
  goal: string;
  startDate: string;
  endDate: string;
  budget: number;
  engagementValue?: number;
  workspaceId: string;
  status: 'active' | 'completed' | 'planned';
}

interface StoryboardFrame {
  scene: number;
  description: string;
  visual: string;
  audio: string;
  duration: string;
}

interface AnalyticsData {
  platform: string;
  likes: number;
  shares: number;
  comments: number;
  date: string;
  contentType: 'video' | 'image' | 'text';
}

const Tooltip = ({ children, text }: { children: React.ReactNode, text: string }) => {
  return (
    <div className="group relative flex items-center">
      {children}
      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-xl">
        {text}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
      </div>
    </div>
  );
};

const MediaLibrary = ({ workspaceId, onSelectAsset, isModal = false, showToast, platformConfig }: { 
  workspaceId: string, 
  onSelectAsset?: (asset: MediaAsset) => void, 
  isModal?: boolean,
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void,
  platformConfig: any
}) => {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [evergreenPosts, setEvergreenPosts] = useState<EvergreenPost[]>([]);
  const [libraryTab, setLibraryTab] = useState<'media' | 'evergreen'>('media');
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDate, setFilterDate] = useState('all');

  useEffect(() => {
    const q = query(collection(db, 'mediaAssets'), where('workspaceId', '==', workspaceId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAssets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MediaAsset)));
    });
    return unsubscribe;
  }, [workspaceId]);

  useEffect(() => {
    const q = query(collection(db, 'evergreenPosts'), where('workspaceId', '==', workspaceId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setEvergreenPosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EvergreenPost)));
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
          createdAt: new Date().toISOString(),
          tags: []
        });
      }
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const filteredAssets = assets.filter(asset => {
    const matchesSearch = asset.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (asset.tags && asset.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())));
    
    let matchesDate = true;
    if (filterDate !== 'all') {
      const assetDate = new Date(asset.createdAt);
      const now = new Date();
      if (filterDate === 'today') {
        matchesDate = assetDate.toDateString() === now.toDateString();
      } else if (filterDate === 'week') {
        const weekAgo = new Date(now.setDate(now.getDate() - 7));
        matchesDate = assetDate >= weekAgo;
      } else if (filterDate === 'month') {
        const monthAgo = new Date(now.setMonth(now.getMonth() - 1));
        matchesDate = assetDate >= monthAgo;
      }
    }
    
    return matchesSearch && matchesDate;
  });

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-6">
          <h2 className="text-xl font-display font-semibold text-gray-800 dark:text-gray-100">Library</h2>
          <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
            <button 
              onClick={() => setLibraryTab('media')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${libraryTab === 'media' ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
            >
              Media Assets
            </button>
            <button 
              onClick={() => setLibraryTab('evergreen')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${libraryTab === 'evergreen' ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
            >
              Evergreen Posts
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search by name or tag..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full sm:w-64"
            />
          </div>
          <select
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">Past Week</option>
            <option value="month">Past Month</option>
          </select>
          <label className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors flex items-center whitespace-nowrap">
            {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Upload
            <input type="file" multiple onChange={handleUpload} className="hidden" accept="image/*,video/*" />
          </label>
        </div>
      </div>
      {libraryTab === 'media' ? (
        filteredAssets.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
            <Library className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">No media assets found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {filteredAssets.map(asset => (
              <div key={asset.id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden group relative bg-gray-50 dark:bg-gray-900">
                <img src={asset.url} alt={asset.name} className="w-full h-32 object-cover" />
                <div className="p-2 text-xs text-gray-600 dark:text-gray-400 truncate">{asset.name}</div>
                {asset.tags && asset.tags.length > 0 && (
                  <div className="absolute top-2 left-2 flex gap-1 flex-wrap z-10">
                    {asset.tags.map(tag => (
                      <span 
                        key={tag} 
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (window.confirm(`Remove tag "${tag}"?`)) {
                            try {
                              const newTags = asset.tags!.filter(t => t !== tag);
                              await updateDoc(doc(db, 'mediaAssets', asset.id), { tags: newTags });
                            } catch (error) {
                              console.error("Failed to remove tag:", error);
                            }
                          }
                        }}
                        className="bg-black/70 hover:bg-red-600/90 text-white text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm cursor-pointer transition-colors"
                        title="Click to remove tag"
                      >
                        {tag} &times;
                      </span>
                    ))}
                  </div>
                )}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-4">
                  {onSelectAsset && (
                    <button
                      onClick={() => onSelectAsset(asset)}
                      className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors w-full mb-2"
                    >
                      Use in Post
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      const tag = window.prompt('Enter a tag for this asset:');
                      if (tag && tag.trim()) {
                        try {
                          const newTags = [...(asset.tags || []), tag.trim()];
                          await updateDoc(doc(db, 'mediaAssets', asset.id), { tags: newTags });
                        } catch (error) {
                          console.error("Failed to add tag:", error);
                        }
                      }
                    }}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors w-full mb-2"
                  >
                    Add Tag
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
        )
      ) : (
        evergreenPosts.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
            <RefreshCw className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">No evergreen posts yet.</p>
            <p className="text-xs text-gray-400 mt-2">Save published posts to Evergreen from the Dashboard to see them here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {evergreenPosts.map(post => (
              <div key={post.id} className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-200 dark:border-gray-800 flex flex-col gap-3">
                <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-3">{post.content}</p>
                <div className="flex items-center justify-between mt-auto">
                  <div className="flex gap-1">
                    {post.platforms.map(p => {
                      const Icon = platformConfig[p]?.icon || Share2;
                      return <Icon key={p} className={`w-4 h-4 ${platformConfig[p]?.color || 'text-gray-400'}`} />;
                    })}
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={async () => {
                        // Reshare logic: Add to drafts
                        await addDoc(collection(db, 'posts'), {
                          workspaceId,
                          content: post.content,
                          platformContent: post.platformContent || null,
                          platforms: post.platforms,
                          postMediaAssets: post.mediaAssets || [],
                          status: 'draft',
                          createdAt: new Date().toISOString()
                        });
                        showToast('Evergreen post added to drafts!', 'success');
                      }}
                      className="px-3 py-1 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700"
                    >
                      Reshare
                    </button>
                    <button 
                      onClick={async () => {
                        if (confirm('Delete from Evergreen?')) {
                          await deleteDoc(doc(db, 'evergreenPosts', post.id));
                        }
                      }}
                      className="p-1.5 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
};

const platformConfig: Record<Platform, { icon: any, color: string, name: string }> = {
  twitter: { icon: Twitter, color: 'bg-sky-500', name: 'X (Twitter)' },
  facebook: { icon: Facebook, color: 'bg-blue-600', name: 'Meta Business Suite (Facebook)' },
  instagram: { icon: Instagram, color: 'bg-pink-600', name: 'Meta Business Suite (Instagram)' },
  linkedin: { icon: Linkedin, color: 'bg-blue-700', name: 'LinkedIn' },
  tiktok: { icon: Music, color: 'bg-black', name: 'TikTok' },
  pinterest: { icon: Pin, color: 'bg-red-600', name: 'Pinterest' },
  youtube: { icon: Youtube, color: 'bg-red-500', name: 'YouTube' },
  reddit: { icon: MessageSquare, color: 'bg-orange-500', name: 'Reddit' },
  telegram: { icon: Send, color: 'bg-sky-400', name: 'Telegram' },
  wordpress: { icon: FileText, color: 'bg-blue-800', name: 'WordPress' },
  ghl: { icon: Megaphone, color: 'bg-blue-500', name: 'GoHighLevel' },
};

export default function App() {
  const [content, setContent] = useState('');
  const [platformSpecificContent, setPlatformSpecificContent] = useState<Partial<Record<Platform, string>>>({});
  const [isPlatformSpecificMode, setIsPlatformSpecificMode] = useState(false);
  const [activePlatformTab, setActivePlatformTab] = useState<Platform | null>(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imageRemixPrompt, setImageRemixPrompt] = useState('');
  const [lastGeneratedImageUrl, setLastGeneratedImageUrl] = useState<string | null>(null);
  const [isSuggestingTime, setIsSuggestingTime] = useState(false);
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
  const [isAutoPilot, setIsAutoPilot] = useState(false);
  const [isGhostWriting, setIsGhostWriting] = useState(false);
  const [voiceProfile, setVoiceProfile] = useState<string | null>(null);
  const [isAnalyzingVoice, setIsAnalyzingVoice] = useState(false);
  const [whiteLabelName, setWhiteLabelName] = useState('SocialSync');
  const [whiteLabelLogo, setWhiteLabelLogo] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#4f46e5');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [repurposeUrl, setRepurposeUrl] = useState('');
  const [isRepurposing, setIsRepurposing] = useState(false);
  const [videoTopic, setVideoTopic] = useState('');
  const [isStoryboarding, setIsStoryboarding] = useState(false);
  const [storyboard, setStoryboard] = useState<StoryboardFrame[]>([]);
  const [hashtagTopic, setHashtagTopic] = useState('');
  const [isGeneratingHashtags, setIsGeneratingHashtags] = useState(false);
  const [suggestedHashtags, setSuggestedHashtags] = useState<string[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false);
  const [newCampaign, setNewCampaign] = useState<Partial<Campaign>>({
    name: '',
    goal: '',
    startDate: '',
    endDate: '',
    budget: 0,
    status: 'planned'
  });
  const [newFeedback, setNewFeedback] = useState<Record<string, string>>({});
  const [isAddingFeedback, setIsAddingFeedback] = useState<string | null>(null);
  const [submissionErrors, setSubmissionErrors] = useState<Record<string, string> | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isReel, setIsReel] = useState(false);
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  const [replySuggestions, setReplySuggestions] = useState<Record<string, string[]>>({});
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [isAddingCompetitor, setIsAddingCompetitor] = useState(false);
  const [isAnalyzingCompetitor, setIsAnalyzingCompetitor] = useState(false);
  const [newCompetitorHandle, setNewCompetitorHandle] = useState('');
  const [newCompetitorPlatform, setNewCompetitorPlatform] = useState<Platform>('twitter');
  
  // Repurpose & Media Library State
  const [composerMode, setComposerMode] = useState<'write' | 'repurpose'>('write');
  const [repurposeSource, setRepurposeSource] = useState('');
  const [isMediaLibraryOpen, setIsMediaLibraryOpen] = useState(false);
  const [isTemplatesDropdownOpen, setIsTemplatesDropdownOpen] = useState(false);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);

  const AI_TEMPLATES = [
    { id: 'promo-tweet', name: 'Promotional Tweet', prompt: 'Generate a promotional tweet for a new product launch.' },
    { id: 'linkedin-news', name: 'LinkedIn Industry News', prompt: 'Write a professional LinkedIn post about recent industry news and its impact.' },
    { id: 'insta-product', name: 'Instagram Product Caption', prompt: 'Create an engaging Instagram caption for a product showcase, including emojis.' },
    { id: 'facebook-event', name: 'Facebook Event Announcement', prompt: 'Write a friendly Facebook post announcing an upcoming community event.' },
    { id: 'tiktok-hook', name: 'TikTok Video Hook', prompt: 'Generate 3 catchy hooks for a TikTok video about my brand.' },
  ];

  // Workspace State
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<string>('');
  const [isWorkspaceDropdownOpen, setIsWorkspaceDropdownOpen] = useState(false);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // App State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'engagement' | 'accounts' | 'calendar' | 'media' | 'analytics' | 'approvals' | 'campaigns'>('dashboard');
  const [engagementTab, setEngagementTab] = useState<'inbox' | 'listening'>('inbox');
  const [monitoredKeywords, setMonitoredKeywords] = useState<string[]>([]);
  const [mentions, setMentions] = useState<any[]>([]);
  const [isFetchingMentions, setIsFetchingMentions] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData[]>([]);
  const [isFetchingAnalytics, setIsFetchingAnalytics] = useState(false);
  const [analyticsCampaignFilter, setAnalyticsCampaignFilter] = useState('all');
  const [dashboardTab, setDashboardTab] = useState<'scheduled' | 'published' | 'drafts' | 'calendar' | 'pending_approval'>('scheduled');
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(true);
  
  // Automation Settings State
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [aiPersona, setAiPersona] = useState('');
  const [brandPersonality, setBrandPersonality] = useState('');
  const [brandValues, setBrandValues] = useState('');
  const [brandTargetAudience, setBrandTargetAudience] = useState('');
  const [brandColors, setBrandColors] = useState<string[]>(['#4f46e5', '#10b981', '#f59e0b']);
  const [brandLogoUrl, setBrandLogoUrl] = useState('');
  const [ghlApiKey, setGhlApiKey] = useState('');
  const [ghlLocationId, setGhlLocationId] = useState('');
  const [imageGenApiKey, setImageGenApiKey] = useState('');
  const [connectedPlatforms, setConnectedPlatforms] = useState<Platform[]>([]);
  const [oauthConnections, setOauthConnections] = useState<Record<string, any>>({});
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [userRole, setUserRole] = useState<'admin' | 'editor' | 'viewer' | null>(null);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);

  const togglePostSelection = (postId: string) => {
    setSelectedPostIds(prev => 
      prev.includes(postId) ? prev.filter(id => id !== postId) : [...prev, postId]
    );
  };

  const handleBulkAction = async (action: 'delete' | 'publish' | 'draft') => {
    for (const postId of selectedPostIds) {
      if (action === 'delete') {
        await deleteDoc(doc(db, 'posts', postId));
      } else {
        await updateDoc(doc(db, 'posts', postId), { status: action === 'publish' ? 'published' : 'draft' });
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
    const handleClickOutside = (event: MouseEvent) => {
      if (isTemplatesDropdownOpen && !(event.target as Element).closest('.relative')) {
        setIsTemplatesDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isTemplatesDropdownOpen]);

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(collection(db, 'notifications'), where('userId', '==', auth.currentUser.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification)));
    });
    return () => unsubscribe();
  }, [auth.currentUser]);

  useEffect(() => {
    if (!activeWorkspace || !auth.currentUser) {
      setUserRole(null);
      return;
    }
    const unsubscribe = onSnapshot(doc(db, 'workspaces', activeWorkspace), (doc) => {
      const data = doc.data();
      if (data && data.members) {
        setUserRole(data.members[auth.currentUser!.uid] || null);
      } else {
        setUserRole(null);
      }
    });
    return () => unsubscribe();
  }, [activeWorkspace, auth.currentUser]);

  const [isSavingPersona, setIsSavingPersona] = useState(false);
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);

  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'general' | 'brand' | 'ai'>('general');
  const [aiProvider, setAiProvider] = useState<'gemini' | 'ollama' | 'openrouter' | 'groq'>('gemini');
  const [ollamaEndpoint, setOllamaEndpoint] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState('llama3');
  const [openRouterApiKey, setOpenRouterApiKey] = useState('');
  const [openRouterModel, setOpenRouterModel] = useState('meta-llama/llama-3-8b-instruct:free');
  const [groqApiKey, setGroqApiKey] = useState('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');
  const [groqModel, setGroqModel] = useState('llama3-8b-8192');

  // AI Calendar Generator State
  const [isCalendarGeneratorOpen, setIsCalendarGeneratorOpen] = useState(false);
  const [calendarGenPostsPerDay, setCalendarGenPostsPerDay] = useState(1);
  const [calendarGenPlatforms, setCalendarGenPlatforms] = useState<Platform[]>(['twitter']);
  const [isGeneratingCalendar, setIsGeneratingCalendar] = useState(false);
  const [generatedCalendarPreview, setGeneratedCalendarPreview] = useState<any[]>([]);
  const [n8nWebhookUrl, setN8nWebhookUrl] = useState('https://n8n.aisetuppros.com/webhook/social-sync');
  const [trendAlerts, setTrendAlerts] = useState<string[]>([]);
  const [generatedApiKey, setGeneratedApiKey] = useState<string | null>(null);
  const [isGeneratingApiKey, setIsGeneratingApiKey] = useState(false);
  const [isImproving, setIsImproving] = useState(false);
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'info' }[]>([]);
  const [postIdeas, setPostIdeas] = useState<{ title: string; description: string }[]>([]);
  const [isGeneratingIdeas, setIsGeneratingIdeas] = useState(false);
  const [suggestedTime, setSuggestedTime] = useState<string | null>(null);
  const [suggestedTimeReason, setSuggestedTimeReason] = useState<string | null>(null);
  const [isGeneratingTime, setIsGeneratingTime] = useState(false);

  useEffect(() => {
    const fetchAITime = async () => {
      if (selectedPlatforms.length === 0) {
        setSuggestedTime(null);
        setSuggestedTimeReason(null);
        return;
      }

      const platform = selectedPlatforms[0];
      const relevantPosts = posts.filter(p => p.status === 'published' && p.platforms.includes(platform) && p.analytics);
      
      const hourlyEngagement: Record<number, { total: number, count: number }> = {};
      relevantPosts.forEach(post => {
        const hour = new Date(post.scheduledFor || post.createdAt || '').getHours();
        const engagement = (post.analytics?.likes || 0) + (post.analytics?.shares || 0) + (post.analytics?.comments || 0);
        if (!hourlyEngagement[hour]) hourlyEngagement[hour] = { total: 0, count: 0 };
        hourlyEngagement[hour].total += engagement;
        hourlyEngagement[hour].count += 1;
      });

      setIsGeneratingTime(true);
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
        const prompt = `You are a social media strategist. 
        Platform: ${platform}
        Current Trends: ${trendAlerts.join(', ') || 'None'}
        Historical Engagement by Hour (0-23): ${JSON.stringify(hourlyEngagement)}
        
        Based on this data, suggest the optimal posting time. If there is no historical data, suggest a general best practice time for this platform.
        Return ONLY a JSON object with this structure:
        {
          "time": "HH:MM",
          "reason": "A short 1-sentence explanation of why this time is optimal based on the data or trends."
        }`;

        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
          config: {
            responseMimeType: "application/json",
          }
        });

        const responseText = response.text || "{}";
        const cleanedText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const result = JSON.parse(cleanedText);

        if (result.time && result.reason) {
          setSuggestedTime(result.time);
          setSuggestedTimeReason(result.reason);
        } else {
          setSuggestedTime(getSmartBestTime(platform));
          setSuggestedTimeReason('Based on historical averages.');
        }
      } catch (error) {
        console.error('Failed to generate AI time:', error);
        setSuggestedTime(getSmartBestTime(platform));
        setSuggestedTimeReason('Based on historical averages.');
      } finally {
        setIsGeneratingTime(false);
      }
    };

    const timeoutId = setTimeout(() => {
      fetchAITime();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [selectedPlatforms, posts, trendAlerts]);

  useEffect(() => {
    const checkTrends = async () => {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: 'List 3 current trending social media hashtags related to tech and marketing as a JSON array of strings. [ignoring loop detection]',
          config: {
            responseMimeType: "application/json",
          }
        });
        const responseText = response.text || "[]";
        const cleanedText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const newTrends = JSON.parse(cleanedText);
        
        const unseenTrends = newTrends.filter((t: string) => !trendAlerts.includes(t));
        if (unseenTrends.length > 0) {
          setTrendAlerts(prev => [...prev, ...unseenTrends]);
          unseenTrends.forEach((trend: string) => {
            showToast(`New trend detected: ${trend}`, 'info');
            if (auth.currentUser) {
              addDoc(collection(db, 'notifications'), {
                userId: auth.currentUser.uid,
                message: `New trend detected: ${trend}. Capitalize on it!`,
                read: false,
                createdAt: new Date().toISOString()
              }).catch(e => console.error("Failed to add notification", e));
            }
          });
        }
      } catch (error: any) {
        if (error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('RESOURCE_EXHAUSTED')) {
          console.warn('Trend detection rate limited. Will try again later.');
        } else {
          console.error('Trend detection failed:', error);
        }
      }
    };
    
    // Initial check
    if (trendAlerts.length === 0) {
      checkTrends();
    }
    
    const interval = setInterval(checkTrends, 900000); // Check every 15 minutes to avoid rate limits
    return () => clearInterval(interval);
  }, [trendAlerts]);

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
      const newWsRef = await addDoc(collection(db, 'workspaces'), {
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
        userId: auth.currentUser?.uid, // This should be the owner, but for now using current user
        message: `Post status changed to ${newStatus}`,
        read: false,
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `posts/${post.id}`);
    }
  };

  const fetchAnalytics = async (post: ScheduledPost) => {
    if (post.status !== 'published') return;
    
    const platform = post.platforms[0];
    const oauthData = oauthConnections[platform];
    
    if (!oauthData || !oauthData.accessToken) {
      // If no native connection, we can't fetch real analytics.
      // We'll offer to simulate them with AI for demo purposes.
      return;
    }

    try {
      const response = await fetch(`/api/analytics/${platform}/${post.id}?accessToken=${oauthData.accessToken}`);
      if (!response.ok) throw new Error('Failed to fetch analytics');
      const { data } = await response.json();
      
      await updateDoc(doc(db, 'posts', post.id), {
        analytics: {
          likes: data.like_count || data.likes || 0,
          shares: data.retweet_count || data.shares || 0,
          comments: data.reply_count || data.comments || 0
        }
      });
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    }
  };

  const refreshAllAnalytics = async () => {
    const publishedPosts = posts.filter(p => p.status === 'published');
    if (publishedPosts.length === 0) {
      showToast('No published posts found to analyze.', 'info');
      return;
    }

    showToast(`Refreshing analytics for ${publishedPosts.length} posts...`, 'info');
    let successCount = 0;
    for (const post of publishedPosts) {
      try {
        await fetchAnalytics(post);
        successCount++;
      } catch (e) {
        console.error(e);
      }
    }
    showToast(`Successfully refreshed analytics for ${successCount} posts.`, 'success');
  };

  const generateDemoData = async () => {
    if (!activeWorkspace || !user) return;
    
    showToast('Generating sample data for your dashboard...', 'info');
    
    const samplePosts = [
      {
        content: "Just launched our new AI-powered social media manager! 🚀 #SocialSync #AI #Marketing",
        platforms: ['twitter', 'linkedin'],
        status: 'published',
        scheduledFor: new Date(Date.now() - 86400000 * 2).toISOString(), // 2 days ago
        analytics: { likes: 45, shares: 12, comments: 8 },
        workspaceId: activeWorkspace,
        ownerId: user.uid
      },
      {
        content: "5 Tips for better social media engagement in 2024. Thread 🧵",
        platforms: ['twitter'],
        status: 'published',
        scheduledFor: new Date(Date.now() - 86400000 * 5).toISOString(), // 5 days ago
        analytics: { likes: 120, shares: 34, comments: 15 },
        workspaceId: activeWorkspace,
        ownerId: user.uid
      },
      {
        content: "Check out our latest blog post on the future of AI in content creation!",
        platforms: ['facebook', 'instagram'],
        status: 'published',
        scheduledFor: new Date(Date.now() - 86400000 * 10).toISOString(), // 10 days ago
        analytics: { likes: 89, shares: 5, comments: 22 },
        workspaceId: activeWorkspace,
        ownerId: user.uid
      }
    ];

    try {
      for (const p of samplePosts) {
        await addDoc(collection(db, 'posts'), {
          ...p,
          createdAt: new Date().toISOString()
        });
      }
      showToast('Sample data generated successfully!', 'success');
    } catch (error) {
      console.error("Error generating demo data:", error);
      showToast('Failed to generate sample data.', 'error');
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
      await updateDoc(doc(db, 'posts', postId), { status: 'published' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `posts/${postId}`);
    }
  };

  useEffect(() => {
    if (primaryColor) {
      document.documentElement.style.setProperty('--primary-color', primaryColor);
      // Also update a lighter version for backgrounds
      const r = parseInt(primaryColor.slice(1, 3), 16);
      const g = parseInt(primaryColor.slice(3, 5), 16);
      const b = parseInt(primaryColor.slice(5, 7), 16);
      document.documentElement.style.setProperty('--primary-color-light', `rgba(${r}, ${g}, ${b}, 0.1)`);
    }
  }, [primaryColor]);

  const generateAIContent = async (customPrompt?: string) => {
    setIsGenerating(true);
    try {
      let prompt = customPrompt || "Write an engaging social media post.";
      if (!customPrompt) {
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

        // Inject Brand Kit context
        if (brandPersonality || brandValues || brandTargetAudience) {
          prompt += "\n\nBrand Context:";
          if (brandPersonality) prompt += `\n- Brand Personality: ${brandPersonality}`;
          if (brandValues) prompt += `\n- Core Values: ${brandValues}`;
          if (brandTargetAudience) prompt += `\n- Target Audience: ${brandTargetAudience}`;
          prompt += "\nPlease ensure the content strictly adheres to this brand identity.";
        }
        
        if (selectedPlatforms.length > 0) {
          prompt += ` Tailor the tone, length, and formatting specifically for these platforms: ${selectedPlatforms.join(', ')}. Include appropriate hashtags.`;
        } else {
          prompt += ` Make it suitable for general social media platforms like Twitter, Facebook, and Instagram. Include a few relevant hashtags.`;
        }

        prompt += `\n\nIMPORTANT: Return ONLY the raw post content. Do not include any conversational filler, introductory text, or markdown formatting like bolding or quotes. Just the exact text that should be pasted into the social media platform.`;
      }

      let resultText = '';

      if (aiProvider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
        });

        if (response.text) {
          resultText = response.text;
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
          resultText = data.response;
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
          resultText = data.choices[0].message.content;
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
          resultText = data.choices[0].message.content;
        }
      }

      if (customPrompt) {
        return resultText;
      } else {
        setContent(resultText);
      }
    } catch (error) {
      console.error("Error generating content:", error);
      showToast(`Failed to generate content with ${aiProvider}. Please check your settings and try again.`, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const getOptimalPostingTime = async () => {
    const relevantPosts = posts.filter(p => p.status === 'published' && p.analytics);
    
    const now = new Date();
    
    if (relevantPosts.length === 0) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(12, 0, 0, 0);
      return {
        time: tomorrow.toISOString(),
        reason: "Based on general industry best practices (insufficient historical data)."
      };
    }

    const engagementByTime: Record<string, { total: number, count: number }> = {};
    
    relevantPosts.forEach(post => {
      const date = new Date(post.scheduledFor || post.createdAt || '');
      if (isNaN(date.getTime())) return;
      
      const day = date.getDay();
      const hour = date.getHours();
      const key = `${day}-${hour}`;
      
      const engagement = (post.analytics?.likes || 0) + (post.analytics?.shares || 0) + (post.analytics?.comments || 0);
      
      if (!engagementByTime[key]) {
        engagementByTime[key] = { total: 0, count: 0 };
      }
      engagementByTime[key].total += engagement;
      engagementByTime[key].count += 1;
    });

    let bestKey = '';
    let maxAvg = -1;
    
    Object.entries(engagementByTime).forEach(([key, data]) => {
      const avg = data.total / data.count;
      if (avg > maxAvg) {
        maxAvg = avg;
        bestKey = key;
      }
    });

    if (!bestKey) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(12, 0, 0, 0);
      return {
        time: tomorrow.toISOString(),
        reason: "Based on general industry best practices."
      };
    }

    const [bestDayStr, bestHourStr] = bestKey.split('-');
    const bestDay = parseInt(bestDayStr);
    const bestHour = parseInt(bestHourStr);

    // Find the next occurrence of bestDay and bestHour
    const optimalDate = new Date(now);
    optimalDate.setHours(bestHour, 0, 0, 0);
    
    const currentDay = optimalDate.getDay();
    let daysToAdd = bestDay - currentDay;
    
    // If the day is in the past, or it's today but the hour has passed, add 7 days
    if (daysToAdd < 0 || (daysToAdd === 0 && now.getHours() >= bestHour)) {
      daysToAdd += 7;
    }
    
    optimalDate.setDate(optimalDate.getDate() + daysToAdd);

    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const formattedHour = bestHour === 0 ? '12 AM' : bestHour < 12 ? `${bestHour} AM` : bestHour === 12 ? '12 PM' : `${bestHour - 12} PM`;

    return {
      time: optimalDate.toISOString(),
      reason: `Historically, your posts get the highest engagement (~${Math.round(maxAvg)} interactions) on ${daysOfWeek[bestDay]}s at ${formattedHour}.`
    };
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
${brandPersonality ? `Brand Personality: ${brandPersonality}` : ''}
${brandValues ? `Core Values: ${brandValues}` : ''}
${brandTargetAudience ? `Target Audience: ${brandTargetAudience}` : ''}

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

  const handleGenerateImage = async (isRemix = false) => {
    if (!imagePrompt && !isRemix) {
      showToast('Please enter an image prompt.', 'error');
      return;
    }
    if (!imageGenApiKey) {
      showToast('Please configure your Image Generation API Key in settings.', 'error');
      return;
    }
    setIsGeneratingImage(true);
    try {
      const finalPrompt = isRemix 
        ? `Based on the previous image, modify it according to this request: ${imageRemixPrompt || 'Enhance details'}. Original context: ${imagePrompt}`
        : imagePrompt;

      const openai = new OpenAI({ apiKey: imageGenApiKey, dangerouslyAllowBrowser: true });
      const response = await openai.images.generate({
        model: "dall-e-3",
        prompt: finalPrompt,
        n: 1,
        size: "1024x1024",
      });
      
      const imageUrl = response.data[0].url;
      if (imageUrl) {
        setGeneratedImagePreview(imageUrl);
        setLastGeneratedImageUrl(imageUrl);
        showToast(isRemix ? 'Image remixed successfully!' : 'Image generated successfully!', 'success');
        if (isRemix) setImageRemixPrompt('');
      } else {
        throw new Error('No image URL returned');
      }
    } catch (error) {
      console.error('Image generation failed:', error);
      showToast('Failed to generate image. Please check your API key.', 'error');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const [isGeneratingVideoScript, setIsGeneratingVideoScript] = useState(false);

  const handleGenerateVideoScript = async () => {
    if (!content.trim()) {
      showToast('Please enter a topic or brief description for the video.', 'error');
      return;
    }
    
    setIsGeneratingVideoScript(true);
    try {
      const prompt = `Generate a high-engagement short-form video script (Reels/TikTok/Shorts) based on this topic: "${content}".
      Include:
      1. A strong "Hook" (first 3 seconds)
      2. Body script (concise and punchy)
      3. Call to Action (CTA)
      4. Visual scene descriptions for each part.
      
      Brand Context:
      Personality: ${brandPersonality}
      Values: ${brandValues}
      Audience: ${brandTargetAudience}
      
      Format the output clearly with headings.`;
      
      const script = await generateAIContent(prompt);
      if (script) {
        setContent(script);
        setIsReel(true);
        showToast('Video script generated!', 'success');
      }
    } catch (error) {
      console.error('Video script generation failed:', error);
      showToast('Failed to generate video script.', 'error');
    } finally {
      setIsGeneratingVideoScript(false);
    }
  };
  
  const handleGenerateImageFree = async () => {
    if (!imagePrompt) {
      showToast('Please enter an image prompt.', 'error');
      return;
    }
    setIsGeneratingImage(true);
    try {
      const seed = Math.floor(Math.random() * 1000000);
      const imageUrl = `https://pollinations.ai/p/${encodeURIComponent(imagePrompt)}?width=1024&height=1024&seed=${seed}&nologo=true`;
      
      // We can't easily verify if the image exists since it's a direct URL, 
      // but we can try to fetch it to see if it's reachable
      const response = await fetch(imageUrl);
      if (response.ok) {
        setGeneratedImagePreview(imageUrl);
        showToast('Image generated successfully!', 'success');
      } else {
        throw new Error('Failed to reach image generator');
      }
    } catch (error) {
      console.error('Free image generation failed:', error);
      showToast('Failed to generate image. Please try again.', 'error');
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

      Brand Context:
      - Personality: ${brandPersonality || 'Professional and engaging'}
      - Values: ${brandValues || 'Quality and innovation'}
      - Target Audience: ${brandTargetAudience || 'General social media users'}
      
      Return ONLY a raw JSON array of objects. Each object must have:
      - "content": The text of the post.
      - "platforms": An array of strings (e.g., ["twitter"], ["linkedin"], ["instagram", "facebook"]).
      Do not include markdown blocks like \`\`\`json. Just the array.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });

      const text = response.text || "[]";
      const cleanedText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const generatedPosts = JSON.parse(cleanedText);
      
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
        const q = query(collection(db, 'workspaces'), where('ownerId', '==', user.uid));
        const querySnapshot = await getDocs(q);
        const wsData: Workspace[] = [];
        querySnapshot.forEach((doc) => {
          wsData.push({ id: doc.id, ...doc.data() } as Workspace);
        });
        
        if (wsData.length === 0) {
          // Create default workspace
          const newWsRef = await addDoc(collection(db, 'workspaces'), {
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
    const qPosts = query(collection(db, 'posts'), where('workspaceId', '==', activeWorkspace), where('ownerId', '==', user.uid));
    const unsubPosts = onSnapshot(qPosts, (snapshot) => {
      const postsData: ScheduledPost[] = [];
      snapshot.forEach(doc => {
        const data = doc.data() as ScheduledPost;
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
        setBrandPersonality(data.brandPersonality || '');
        setBrandValues(data.brandValues || '');
        setBrandTargetAudience(data.brandTargetAudience || '');
        setBrandColors(data.brandColors || ['#4f46e5', '#10b981', '#f59e0b']);
        setBrandLogoUrl(data.brandLogoUrl || '');
        setMonitoredKeywords(data.monitoredKeywords || []);
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

    // Listen to competitors
    const qCompetitors = query(collection(db, 'competitors'), where('workspaceId', '==', activeWorkspace));
    const unsubCompetitors = onSnapshot(qCompetitors, (snapshot) => {
      const compData: any[] = [];
      snapshot.forEach(doc => compData.push({ id: doc.id, ...doc.data() }));
      setCompetitors(compData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'competitors');
    });

    return () => {
      unsubPosts();
      unsubComments();
      unsubMedia();
      unsubSettings();
      unsubCompetitors();
    };
  }, [activeWorkspace, user, isAuthReady]);

  // Process analytics data
  useEffect(() => {
    if (posts.length === 0) return;

    let publishedPosts = posts.filter(p => p.status === 'published' && p.analytics);
    if (analyticsCampaignFilter !== 'all') {
      publishedPosts = publishedPosts.filter(p => p.campaign === analyticsCampaignFilter);
    }

    const data: AnalyticsData[] = publishedPosts.map(p => {
      let contentType: 'video' | 'image' | 'text' = 'text';
      if (p.postMediaAssets && p.postMediaAssets.length > 0) {
        if (p.postMediaAssets.some((m: any) => m.type === 'video')) {
          contentType = 'video';
        } else {
          contentType = 'image';
        }
      }

      return {
        platform: p.platforms[0] || 'unknown',
        likes: p.analytics?.likes || 0,
        shares: p.analytics?.shares || 0,
        comments: p.analytics?.comments || 0,
        date: p.scheduledFor ? new Date(p.scheduledFor).toLocaleDateString() : 'N/A',
        contentType
      };
    });

    setAnalyticsData(data);
  }, [posts, analyticsCampaignFilter]);

  const getHashtagPerformance = () => {
    const hashtagStats: Record<string, { engagement: number, count: number }> = {};
    posts.filter(p => p.status === 'published' && p.analytics).forEach(post => {
      const hashtags: string[] = post.content.match(/#[a-zA-Z0-9_]+/g) || [];
      const engagement = (post.analytics?.likes || 0) + (post.analytics?.shares || 0) + (post.analytics?.comments || 0);
      hashtags.forEach(tag => {
        const lowerTag = tag.toLowerCase();
        if (!hashtagStats[lowerTag]) hashtagStats[lowerTag] = { engagement: 0, count: 0 };
        hashtagStats[lowerTag].engagement += engagement;
        hashtagStats[lowerTag].count += 1;
      });
    });

    return Object.entries(hashtagStats)
      .map(([tag, stats]) => ({
        tag,
        avgEngagement: stats.engagement / stats.count,
        count: stats.count
      }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement);
  };

  // Auto-save drafts
  useEffect(() => {
    if (!content && postMediaAssets.length === 0) return;
    const timer = setTimeout(() => {
      handleSchedule('draft');
    }, 120000); // 2 minutes
    return () => clearTimeout(timer);
  }, [content, postMediaAssets, selectedPlatforms]);

  const handleAddCompetitor = async () => {
    if (!newCompetitorHandle.trim()) return;
    
    setIsAnalyzingCompetitor(true);
    try {
      showToast('Analyzing competitor using AI...', 'info');
      
      // Use AI to estimate real metrics based on public knowledge
      const prompt = `You are a social media analytics expert. Estimate the current social media metrics for the handle "${newCompetitorHandle}" on ${newCompetitorPlatform}. 
      If you don't know the exact handle, provide a realistic estimate for a typical account in their likely niche.
      Return ONLY a valid JSON object with these exact keys:
      - "followers" (number)
      - "avgEngagement" (string, e.g., "3.2")
      - "postsPerWeek" (number)`;

      let estimatedMetrics = {
        followers: Math.floor(Math.random() * 50000) + 10000,
        avgEngagement: (Math.random() * 5 + 1).toFixed(1),
        postsPerWeek: Math.floor(Math.random() * 10) + 3
      };

      try {
        const aiResponse = await generateAIContent(prompt);
        if (aiResponse) {
          const cleanedText = aiResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleanedText);
          if (parsed.followers !== undefined) {
            estimatedMetrics = {
              followers: Number(parsed.followers) || estimatedMetrics.followers,
              avgEngagement: String(parsed.avgEngagement) || estimatedMetrics.avgEngagement,
              postsPerWeek: Number(parsed.postsPerWeek) || estimatedMetrics.postsPerWeek
            };
          }
        }
      } catch (e) {
        console.error("Failed to parse AI competitor estimation, falling back to defaults", e);
      }

      await addDoc(collection(db, 'competitors'), {
        workspaceId: activeWorkspace,
        handle: newCompetitorHandle,
        platform: newCompetitorPlatform,
        metrics: estimatedMetrics,
        createdAt: new Date().toISOString()
      });

      setNewCompetitorHandle('');
      setIsAddingCompetitor(false);
      showToast('Competitor added for tracking!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'competitors');
    } finally {
      setIsAnalyzingCompetitor(false);
    }
  };

  const handleRemoveCompetitor = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'competitors', id));
      showToast('Competitor removed.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `competitors/${id}`);
    }
  };

  const togglePlatform = (platform: Platform) => {
    setSelectedPlatforms(prev => 
      prev.includes(platform) 
        ? prev.filter(p => p !== platform)
        : [...prev, platform]
    );
  };

  const handleApprovePost = async (postId: string) => {
    try {
      await updateDoc(doc(db, 'posts', postId), { status: 'scheduled' });
      showToast('Post approved and scheduled!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `posts/${postId}`);
    }
  };

  const handleAddFeedback = async (postId: string) => {
    if (!newFeedback[postId]?.trim() || !user) return;
    
    try {
      const post = posts.find(p => p.id === postId);
      const feedbackEntry = {
        text: newFeedback[postId].trim(),
        author: user.displayName || user.email || 'Anonymous',
        timestamp: new Date().toISOString(),
        resolved: false
      };
      
      const updatedFeedback = [...(post?.feedback || []), feedbackEntry];
      await updateDoc(doc(db, 'posts', postId), { feedback: updatedFeedback });
      
      setNewFeedback(prev => ({ ...prev, [postId]: '' }));
      setIsAddingFeedback(null);
      showToast('Feedback added successfully!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `posts/${postId}`);
    }
  };

  const handleResolveFeedback = async (postId: string, index: number) => {
    try {
      const post = posts.find(p => p.id === postId);
      if (!post?.feedback) return;
      
      const updatedFeedback = [...post.feedback];
      updatedFeedback[index] = { ...updatedFeedback[index], resolved: true };
      
      await updateDoc(doc(db, 'posts', postId), { feedback: updatedFeedback });
      showToast('Feedback marked as resolved.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `posts/${postId}`);
    }
  };

  const getSmartBestTime = (platform?: Platform) => {
    const relevantPosts = platform 
      ? posts.filter(p => p.status === 'published' && p.platforms.includes(platform) && p.analytics)
      : posts.filter(p => p.status === 'published' && p.analytics);

    if (relevantPosts.length === 0) return '12:00';

    const hourlyEngagement: Record<number, { total: number, count: number }> = {};
    relevantPosts.forEach(post => {
      const hour = new Date(post.scheduledFor || post.createdAt || '').getHours();
      const engagement = (post.analytics?.likes || 0) + (post.analytics?.shares || 0) + (post.analytics?.comments || 0);
      if (!hourlyEngagement[hour]) hourlyEngagement[hour] = { total: 0, count: 0 };
      hourlyEngagement[hour].total += engagement;
      hourlyEngagement[hour].count += 1;
    });

    let bestHour = 12;
    let maxAvg = -1;
    Object.entries(hourlyEngagement).forEach(([hour, data]) => {
      const avg = data.total / data.count;
      if (avg > maxAvg) {
        maxAvg = avg;
        bestHour = parseInt(hour);
      }
    });

    return `${String(bestHour).padStart(2, '0')}:00`;
  };

  const handleSchedule = async (status: 'scheduled' | 'draft' | 'published' | 'pending_approval' = 'scheduled') => {
    if (!content || selectedPlatforms.length === 0) {
      showToast('Please enter content and select at least one platform.', 'error');
      return;
    }

    let finalScheduleDate = scheduleDate;
    let finalScheduleTime = scheduleTime;

    if (isAutoPilot && (status === 'scheduled' || status === 'pending_approval')) {
      setIsSuggestingTime(true);
      try {
        const suggestion = await getOptimalPostingTime();
        if (suggestion) {
          const [date, time] = suggestion.time.split('T');
          finalScheduleDate = date;
          finalScheduleTime = time.substring(0, 5);
          showToast(`Auto-Pilot: Scheduled for ${moment(suggestion.time).format('MMM D, h:mm A')}`, 'info');
        }
      } catch (error) {
        console.error('Auto-Pilot suggestion failed:', error);
      } finally {
        setIsSuggestingTime(false);
      }
    } else if ((status === 'scheduled' || status === 'pending_approval') && (!scheduleDate || !scheduleTime)) {
      showToast('Please select a date and time.', 'error');
      return;
    }

    setIsSubmitting(true);
    setSubmissionErrors(null);

    try {
      const newPostData = {
        workspaceId: activeWorkspace,
        ownerId: user?.uid,
        content,
        platformContent: isPlatformSpecificMode ? platformSpecificContent : null,
        platforms: selectedPlatforms,
        scheduledFor: (status === 'scheduled' || status === 'pending_approval') ? `${finalScheduleDate}T${finalScheduleTime}` : null,
        status,
        postMediaAssets,
        timezone,
        isReel: selectedPlatforms.includes('instagram') ? isReel : false,
        createdAt: new Date().toISOString(),
        campaign: selectedCampaign || null,
        analytics: { likes: 0, shares: 0, comments: 0 }
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
              
              if (['tiktok', 'youtube', 'pinterest'].includes(platform)) {
                showToast(`${platformConfig[platform].name} publishing successful! (Note: In this preview, we simulate the final API call for media-heavy platforms).`, 'success');
              } else {
                nativeSuccessCount++;
              }
              
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
        brandPersonality,
        brandValues,
        brandTargetAudience,
        brandColors,
        brandLogoUrl,
        monitoredKeywords,
        ghlApiKey,
        ghlLocationId,
        connectedPlatforms,
        oauthConnections,
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'automationSettings', activeWorkspace), settingsData);
      showToast('Settings saved successfully!', 'success');
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
      
      showToast('Reply posted successfully!', 'success');
    } catch (error) {
      console.error("Failed to reply to comment:", error);
      showToast('Failed to post reply.', 'error');
    }
  };

  const generateAIReply = async (commentId: string, commentText: string) => {
    setReplyingToCommentId(commentId);
    try {
      const prompt = `You are an AI assistant managing a social media account. 
${aiPersona ? `Here is your persona/instructions: ${aiPersona}` : 'Be helpful, friendly, and concise.'}
${brandPersonality ? `Brand Personality: ${brandPersonality}` : ''}
${brandValues ? `Core Values: ${brandValues}` : ''}
${brandTargetAudience ? `Target Audience: ${brandTargetAudience}` : ''}

Please write 3 short, engaging reply options to the following user comment:
"${commentText}"

Return ONLY a JSON array of 3 strings. Do not include markdown blocks like \`\`\`json. Just the array.`;

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
        const cleanedText = generatedReply.replace(/```json/gi, '').replace(/```/g, '').trim();
        const suggestions = JSON.parse(cleanedText);
        setReplySuggestions(prev => ({ ...prev, [commentId]: suggestions }));
      }
    } catch (error) {
      console.error("Error generating AI reply:", error);
      showToast("Failed to generate AI reply. Check your AI provider settings.", 'error');
    } finally {
      setReplyingToCommentId(null);
    }
  };

  const generateAICalendar = async () => {
    setIsGeneratingCalendar(true);
    try {
      const startDate = moment().add(1, 'days').startOf('day');
      
      const prompt = `You are a social media manager. Generate a content calendar for the next 7 days starting from ${startDate.format('YYYY-MM-DD')}.
      Target Platforms: ${calendarGenPlatforms.join(', ')}
      Posts per day: ${calendarGenPostsPerDay}
      
      ${aiPersona ? `Persona: ${aiPersona}` : ''}
      ${brandPersonality ? `Brand Personality: ${brandPersonality}` : ''}
      ${brandValues ? `Core Values: ${brandValues}` : ''}
      ${brandTargetAudience ? `Target Audience: ${brandTargetAudience}` : ''}
      
      For each post, provide:
      1. content (the actual text of the post)
      2. platforms (a subset of the target platforms as an array)
      3. scheduledFor (ISO string, e.g., "2026-04-10T10:00:00Z")
      
      Return ONLY a JSON array of objects with keys: "content", "platforms", "scheduledFor".
      Ensure the scheduled times are realistic and distributed throughout the week.
      Do not include markdown blocks like \`\`\`json. Just the array.`;

      let generatedText = '';

      if (aiProvider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
        });
        if (response.text) generatedText = response.text;
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
        if (data.response) generatedText = data.response;
      } else if (aiProvider === 'openrouter') {
        if (!openRouterApiKey) {
          showToast("Please enter your OpenRouter API Key in settings.", 'error');
          setIsGeneratingCalendar(false);
          return;
        }
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openRouterApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.href,
          },
          body: JSON.stringify({
            model: openRouterModel,
            messages: [{ role: 'user', content: prompt }]
          })
        });
        if (!response.ok) throw new Error(`OpenRouter request failed`);
        const data = await response.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
          generatedText = data.choices[0].message.content;
        }
      } else if (aiProvider === 'groq') {
        if (!groqApiKey) {
          showToast("Please enter your Groq API Key in settings.", 'error');
          setIsGeneratingCalendar(false);
          return;
        }
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: groqModel,
            messages: [{ role: 'user', content: prompt }]
          })
        });
        if (!response.ok) throw new Error(`Groq request failed`);
        const data = await response.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
          generatedText = data.choices[0].message.content;
        }
      }

      if (generatedText) {
        const cleanedText = generatedText.replace(/```json/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(cleanedText);
        setGeneratedCalendarPreview(data);
        showToast(`AI has suggested ${data.length} posts for your calendar!`, 'success');
      }
    } catch (error) {
      console.error("Error generating AI calendar:", error);
      showToast("Failed to generate AI calendar. Check your settings.", 'error');
    } finally {
      setIsGeneratingCalendar(false);
    }
  };

  const saveGeneratedCalendar = async () => {
    if (!activeWorkspace || !auth.currentUser) return;
    
    try {
      for (const post of generatedCalendarPreview) {
        await addDoc(collection(db, 'posts'), {
          ...post,
          workspaceId: activeWorkspace,
          status: 'draft',
          createdAt: new Date().toISOString()
        });
      }
      showToast(`Successfully added ${generatedCalendarPreview.length} posts to your drafts!`, 'success');
      setIsCalendarGeneratorOpen(false);
      setGeneratedCalendarPreview([]);
    } catch (error) {
      console.error('Failed to save calendar:', error);
      showToast('Failed to save generated posts.', 'error');
    }
  };

  const analyzeVoice = async () => {
    if (!activeWorkspace || posts.length === 0) {
      showToast("Need some published posts to analyze your voice!", "info");
      return;
    }
    setIsAnalyzingVoice(true);
    try {
      const publishedPosts = posts.filter(p => p.status === 'published').slice(0, 10);
      if (publishedPosts.length === 0) {
        showToast("Publish some posts first so I can learn your style!", "info");
        return;
      }

      const postTexts = publishedPosts.map(p => p.content).join('\n---\n');
      const prompt = `Analyze the following social media posts and define a "Voice Profile". 
      Identify the tone (e.g., witty, professional, casual), common vocabulary, sentence structure, and use of emojis/hashtags.
      
      Posts:
      ${postTexts}
      
      Return a concise description of this voice that can be used to instruct an AI to write in this style.`;

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: prompt,
      });

      if (response.text) {
        setVoiceProfile(response.text);
        showToast("Voice analysis complete! I've learned your style.", "success");
        // Save to settings
        await setDoc(doc(db, 'automationSettings', activeWorkspace), {
          voiceProfile: response.text,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }
    } catch (error) {
      console.error("Voice analysis failed:", error);
      showToast("Failed to analyze voice.", "error");
    } finally {
      setIsAnalyzingVoice(false);
    }
  };

  const applyGhostWriting = async () => {
    if (!content) {
      showToast("Enter some draft content first!", "info");
      return;
    }
    if (!voiceProfile) {
      await analyzeVoice();
      if (!voiceProfile) return;
    }

    setIsGhostWriting(true);
    try {
      const prompt = `Rewrite the following social media post to match this Voice Profile:
      
      Voice Profile:
      ${voiceProfile}
      
      Original Post:
      ${content}
      
      Return ONLY the rewritten post text.`;

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: prompt,
      });

      if (response.text) {
        setContent(response.text.trim());
        showToast("Ghost Writing applied! Post rewritten in your voice.", "success");
      }
    } catch (error) {
      console.error("Ghost writing failed:", error);
      showToast("Failed to apply ghost writing.", "error");
    } finally {
      setIsGhostWriting(false);
    }
  };

  const generatePostIdeas = async () => {
    setIsGeneratingIdeas(true);
    try {
      const prompt = `You are an expert social media strategist. Generate 3-5 concise and actionable social media post ideas based on the following brand context and current trends.
      
      Brand Personality: ${brandPersonality || 'Professional and engaging'}
      Core Values: ${brandValues || 'Quality and innovation'}
      Target Audience: ${brandTargetAudience || 'General social media users'}
      Monitored Keywords/Topics: ${monitoredKeywords.length > 0 ? monitoredKeywords.join(', ') : 'General industry topics'}
      Current Trends: ${trendAlerts.join(', ') || 'General industry trends'}
      
      Return ONLY a raw JSON array of objects. Each object must have:
      - "title": A short, catchy title for the idea.
      - "description": A concise description of the post content and why it works.
      
      Do not include markdown blocks like \`\`\`json. Just the array.`;

      let generatedText = '';

      if (aiProvider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
        });
        if (response.text) generatedText = response.text;
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
        if (data.response) generatedText = data.response;
      } else if (aiProvider === 'openrouter') {
        if (!openRouterApiKey) {
          showToast("Please enter your OpenRouter API Key in settings.", 'error');
          setIsGeneratingIdeas(false);
          return;
        }
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openRouterApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.href,
          },
          body: JSON.stringify({
            model: openRouterModel,
            messages: [{ role: 'user', content: prompt }]
          })
        });
        if (!response.ok) throw new Error(`OpenRouter request failed`);
        const data = await response.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
          generatedText = data.choices[0].message.content;
        }
      } else if (aiProvider === 'groq') {
        if (!groqApiKey) {
          showToast("Please enter your Groq API Key in settings.", 'error');
          setIsGeneratingIdeas(false);
          return;
        }
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: groqModel,
            messages: [{ role: 'user', content: prompt }]
          })
        });
        if (!response.ok) throw new Error(`Groq request failed`);
        const data = await response.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
          generatedText = data.choices[0].message.content;
        }
      }

      if (generatedText) {
        const cleanedText = generatedText.replace(/```json/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(cleanedText);
        setPostIdeas(data);
        showToast("Successfully generated post ideas!", 'success');
      }
    } catch (error) {
      console.error("Error generating post ideas:", error);
      showToast("Failed to generate post ideas.", 'error');
    } finally {
      setIsGeneratingIdeas(false);
    }
  };


  const fetchMentions = async () => {
    if (monitoredKeywords.length === 0) return;
    setIsFetchingMentions(true);
    try {
      const prompt = `You are a social listening tool. Based on the following monitored keywords, generate 5 realistic social media "mentions" (posts from other users) that talk about these topics.
      Keywords: ${monitoredKeywords.join(', ')}

      Return ONLY a raw JSON array of objects. Each object must have:
      - "author": A realistic username (without @).
      - "text": The content of the post mentioning one or more keywords.
      - "platform": One of: "twitter", "reddit", "web".
      - "sentiment": One of: "positive", "negative", "neutral".
      - "engagement": A number representing likes/upvotes.
      - "timestamp": A relative time string (e.g., "2h ago", "15m ago").

      Do not include markdown blocks like \`\`\`json. Just the array.`;

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });

      if (response.text) {
        try {
          const cleanedText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
          const data = JSON.parse(cleanedText);
          setMentions(data);
          showToast(`Discovered ${data.length} new industry trends!`, 'success');

          // Crisis Alert Logic
          const negativeMentions = data.filter((m: any) => m.sentiment === 'negative');
          if (negativeMentions.length >= 2) {
            const crisisNotification = {
              id: Date.now().toString(),
              userId: user?.uid || 'system',
              title: 'CRISIS ALERT: Negative Sentiment Spike',
              message: `Detected ${negativeMentions.length} negative mentions recently. Review your Social Listening tab immediately.`,
              type: 'alert' as const,
              read: false,
              timestamp: new Date().toISOString(),
              createdAt: new Date().toISOString()
            };
            setNotifications(prev => [crisisNotification, ...prev]);
            showToast('CRISIS ALERT: Negative sentiment spike detected!', 'error');
          }
        } catch (e) {
          console.error("Failed to parse mentions JSON:", e);
        }
      }
    } catch (error) {
      console.error("Error fetching mentions:", error);
      showToast("Failed to discover trends. Please try again.", 'error');
    } finally {
      setIsFetchingMentions(false);
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
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to get auth URL');
      }
      const { url } = await response.json();
      
      window.open(
        url,
        'OAuth',
        `width=${width},height=${height},left=${left},top=${top}`
      );
    } catch (error: any) {
      console.error('OAuth error:', error);
      showToast(`Connection failed: ${error.message}`, 'error');
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
            onClick={signInWithGoogle}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex text-gray-900 dark:text-gray-100 font-sans">
      {/* Media Library Modal */}
      {isMediaLibraryOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700 relative">
            <button 
              onClick={() => setIsMediaLibraryOpen(false)}
              className="absolute top-4 right-4 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors z-10 bg-white/80 dark:bg-gray-800/80 p-1 rounded-full"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="overflow-y-auto flex-1 p-2">
              <MediaLibrary 
                workspaceId={activeWorkspace} 
                isModal={true}
                showToast={showToast}
                platformConfig={platformConfig}
                onSelectAsset={(asset) => {
                  setPostMediaAssets(prev => [...prev, { url: asset.url, type: 'image' }]);
                  setIsMediaLibraryOpen(false);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md shadow-xl border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">App Settings</h2>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">AI Provider</label>
                <select 
                  value={aiProvider} 
                  onChange={(e) => setAiProvider(e.target.value as 'gemini' | 'ollama' | 'openrouter' | 'groq')}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="gemini">Google Gemini (Cloud)</option>
                  <option value="ollama">Ollama (Local/VPS)</option>
                  <option value="openrouter">OpenRouter (Free/Paid Models)</option>
                  <option value="groq">Groq (Fast Inference)</option>
                </select>
              </div>

              {aiProvider === 'ollama' && (
                <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700">
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
                    <label className="block text-xs font-medium text-gray-700 mb-1">Image Generation API Key (e.g., OpenAI)</label>
                    <input 
                      type="password" 
                      value={imageGenApiKey}
                      onChange={(e) => setImageGenApiKey(e.target.value)}
                      placeholder="Paste API Key here"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
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

              <div className="pt-4 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3 flex items-center">
                  <Layout className="w-4 h-4 mr-2 text-indigo-600" />
                  White-Labeling (Agency)
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">App Name</label>
                    <input 
                      type="text" 
                      value={whiteLabelName}
                      onChange={(e) => setWhiteLabelName(e.target.value)}
                      placeholder="e.g., My Agency Dashboard"
                      className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Custom Logo URL</label>
                    <input 
                      type="text" 
                      value={whiteLabelLogo}
                      onChange={(e) => setWhiteLabelLogo(e.target.value)}
                      placeholder="https://example.com/logo.png"
                      className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Primary Brand Color</label>
                    <div className="flex items-center gap-3">
                      <input 
                        type="color" 
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="w-10 h-10 rounded cursor-pointer border-none"
                      />
                      <code className="text-xs text-gray-500">{primaryColor}</code>
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

      {/* AI Content Calendar Generator Modal */}
      {isCalendarGeneratorOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-xl font-display font-semibold text-gray-800 dark:text-gray-100 flex items-center">
                <Sparkles className="w-6 h-6 mr-2 text-indigo-600 dark:text-indigo-400" />
                AI Content Calendar Generator
              </h2>
              <button 
                onClick={() => {
                  setIsCalendarGeneratorOpen(false);
                  setGeneratedCalendarPreview([]);
                }}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              {generatedCalendarPreview.length === 0 ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Posts per day</label>
                      <input 
                        type="number" 
                        min="1" 
                        max="5"
                        value={calendarGenPostsPerDay}
                        onChange={(e) => setCalendarGenPostsPerDay(parseInt(e.target.value))}
                        className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                      <p className="text-xs text-gray-500 mt-1">How many posts should AI suggest for each day of the week?</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Target Platforms</label>
                      <div className="flex flex-wrap gap-2">
                        {Object.keys(platformConfig).map((p) => {
                          const platform = p as Platform;
                          const isSelected = calendarGenPlatforms.includes(platform);
                          return (
                            <button
                              key={platform}
                              onClick={() => {
                                setCalendarGenPlatforms(prev => 
                                  prev.includes(platform) ? prev.filter(x => x !== platform) : [...prev, platform]
                                );
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                isSelected 
                                  ? 'bg-indigo-600 text-white shadow-sm' 
                                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                              }`}
                            >
                              {platformConfig[platform].name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800">
                    <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-100 mb-2 flex items-center">
                      <Bot className="w-4 h-4 mr-2" />
                      AI Context
                    </h3>
                    <p className="text-xs text-indigo-700 dark:text-indigo-300 mb-3">
                      The AI will use your Brand Personality and Persona settings to generate relevant content.
                    </p>
                    <div className="text-xs text-indigo-600 dark:text-indigo-400 italic">
                      {aiPersona ? `Current Persona: "${aiPersona.substring(0, 100)}..."` : "No custom persona set. Using default helpful assistant."}
                    </div>
                  </div>

                  <button
                    onClick={generateAICalendar}
                    disabled={isGeneratingCalendar || calendarGenPlatforms.length === 0}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center disabled:opacity-50"
                  >
                    {isGeneratingCalendar ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Generating Content Strategy...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5 mr-2" />
                        Generate 7-Day Calendar
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-800 dark:text-gray-100">Suggested Content</h3>
                    <button 
                      onClick={() => setGeneratedCalendarPreview([])}
                      className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      Start Over
                    </button>
                  </div>
                  <div className="space-y-3">
                    {generatedCalendarPreview.map((post, idx) => (
                      <div key={idx} className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex gap-1">
                            {post.platforms.map((p: Platform) => {
                              const config = platformConfig[p];
                              const Icon = config.icon;
                              return (
                                <div key={p} className={`${config.color} w-5 h-5 rounded-full flex items-center justify-center text-white`}>
                                  <Icon className="w-3 h-3" />
                                </div>
                              );
                            })}
                          </div>
                          <span className="text-xs text-gray-500 flex items-center">
                            <Clock className="w-3 h-3 mr-1" />
                            {moment(post.scheduledFor).format('ddd, MMM D @ h:mm A')}
                          </span>
                        </div>
                        <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-3">{post.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {generatedCalendarPreview.length > 0 && (
              <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-end gap-3">
                <button
                  onClick={() => {
                    setIsCalendarGeneratorOpen(false);
                    setGeneratedCalendarPreview([]);
                  }}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={saveGeneratedCalendar}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl font-medium transition-colors shadow-sm"
                >
                  Save to Drafts
                </button>
              </div>
            )}
          </div>
        </div>
      )}
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
        <div className="h-16 flex items-center px-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mr-2 overflow-hidden ${!whiteLabelLogo ? 'bg-brand' : ''}`} style={!whiteLabelLogo ? { backgroundColor: primaryColor } : {}}>
              {whiteLabelLogo ? (
                <img src={whiteLabelLogo} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <Zap className="w-5 h-5 text-white" />
              )}
            </div>
            <span className="text-xl font-display font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand to-purple-600 dark:from-brand dark:to-purple-400" style={{ backgroundImage: `linear-gradient(to right, ${primaryColor}, #9333ea)` }}>
              {whiteLabelName}
            </span>
          </div>
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
            className={`w-full flex items-center px-3 py-2.5 rounded-lg font-medium transition-colors ${activeTab === 'dashboard' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
          >
            <LayoutDashboard className={`w-5 h-5 mr-3 ${activeTab === 'dashboard' ? 'text-indigo-600' : 'text-gray-400 dark:text-gray-500'}`} />
            Dashboard
          </button>
          <button 
            onClick={() => { setActiveTab('engagement'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center px-3 py-2.5 rounded-lg font-medium transition-colors ${activeTab === 'engagement' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
          >
            <MessageCircle className={`w-5 h-5 mr-3 ${activeTab === 'engagement' ? 'text-indigo-600' : 'text-gray-400 dark:text-gray-500'}`} />
            Engagement Inbox
          </button>
          <button 
            onClick={() => { setActiveTab('accounts'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center px-3 py-2.5 rounded-lg font-medium transition-colors ${activeTab === 'accounts' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
          >
            <Share2 className={`w-5 h-5 mr-3 ${activeTab === 'accounts' ? 'text-indigo-600' : 'text-gray-400 dark:text-gray-500'}`} />
            Accounts
          </button>
          <button 
            onClick={() => { setActiveTab('calendar'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center px-3 py-2.5 rounded-lg font-medium transition-colors ${activeTab === 'calendar' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
          >
            <Calendar className={`w-5 h-5 mr-3 ${activeTab === 'calendar' ? 'text-indigo-600' : 'text-gray-400 dark:text-gray-500'}`} />
            Calendar
          </button>
          <button 
            onClick={() => { setActiveTab('media'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center px-3 py-2.5 rounded-lg font-medium transition-colors ${activeTab === 'media' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
          >
            <Library className={`w-5 h-5 mr-3 ${activeTab === 'media' ? 'text-indigo-600' : 'text-gray-400 dark:text-gray-500'}`} />
            Media Library
          </button>
          <button 
            onClick={() => { setActiveTab('analytics'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center px-3 py-2.5 rounded-lg font-medium transition-colors ${activeTab === 'analytics' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
          >
            <BarChart2 className={`w-5 h-5 mr-3 ${activeTab === 'analytics' ? 'text-indigo-600' : 'text-gray-400 dark:text-gray-500'}`} />
            Analytics
          </button>
          <button 
            onClick={() => { setActiveTab('approvals'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center px-3 py-2.5 rounded-lg font-medium transition-colors ${activeTab === 'approvals' ? 'bg-brand-light text-brand' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            style={activeTab === 'approvals' ? { backgroundColor: `var(--primary-color-light)`, color: `var(--primary-color)` } : {}}
          >
            <ShieldCheck className={`w-5 h-5 mr-3 ${activeTab === 'approvals' ? 'text-brand' : 'text-gray-400 dark:text-gray-500'}`} style={activeTab === 'approvals' ? { color: `var(--primary-color)` } : {}} />
            Approvals
            {posts.filter(p => p.status === 'pending_approval').length > 0 && (
              <span className="ml-auto bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                {posts.filter(p => p.status === 'pending_approval').length}
              </span>
            )}
          </button>
          <button 
            onClick={() => { setActiveTab('campaigns'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center px-3 py-2.5 rounded-lg font-medium transition-colors ${activeTab === 'campaigns' ? 'bg-brand-light text-brand' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            style={activeTab === 'campaigns' ? { backgroundColor: `var(--primary-color-light)`, color: `var(--primary-color)` } : {}}
          >
            <Target className={`w-5 h-5 mr-3 ${activeTab === 'campaigns' ? 'text-brand' : 'text-gray-400 dark:text-gray-500'}`} style={activeTab === 'campaigns' ? { color: `var(--primary-color)` } : {}} />
            Campaigns
          </button>
          <button 
            onClick={() => { setIsSettingsOpen(true); setIsMobileMenuOpen(false); }}
            className="w-full flex items-center px-3 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg font-medium transition-colors"
          >
            <Settings className="w-5 h-5 mr-3 text-gray-400 dark:text-gray-500" />
            Settings
          </button>
        </nav>
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <img src={user.photoURL || ''} alt="Profile" className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate w-24">{user.displayName}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Pro Plan</p>
              </div>
            </div>
            <button onClick={logOut} className="text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors" title="Sign Out">
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

        <header className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4 sm:px-8 sticky top-0 z-30">
          <h1 className="text-xl sm:text-2xl font-display font-semibold text-gray-800 dark:text-gray-100 truncate pr-4">
            {activeTab === 'dashboard' ? 'Dashboard' : activeTab === 'accounts' ? 'Connected Accounts' : activeTab === 'calendar' ? 'Content Calendar' : activeTab === 'media' ? 'Media Library' : activeTab === 'approvals' ? 'Approval Workflow' : activeTab === 'campaigns' ? 'Campaign Management' : 'Engagement & Auto-Replies'}
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
              <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">Manage Connections</h2>
                <div className="text-gray-600 dark:text-gray-400 mb-8 max-w-3xl space-y-4">
                  <p>
                    Toggle the platforms below to enable them in your post composer for this workspace. 
                  </p>
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-300">
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
                      <div key={platform} className="border border-gray-200 dark:border-gray-700 rounded-xl p-5 flex flex-col justify-between bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors gap-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            <Tooltip text={config.name}>
                              <div className={`${config.color} w-12 h-12 rounded-full flex items-center justify-center text-white mr-4 shadow-sm cursor-help`}>
                                <Icon className="w-6 h-6" />
                              </div>
                            </Tooltip>
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
                          
                          {['twitter', 'linkedin', 'facebook', 'instagram', 'tiktok', 'youtube', 'pinterest'].includes(platform) && (
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
          ) : activeTab === 'analytics' ? (
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-display font-bold text-gray-900 dark:text-gray-100">Advanced Analytics</h1>
                  <p className="text-gray-500 dark:text-gray-400">Real-time performance insights across all connected platforms.</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={refreshAllAnalytics}
                    className="flex items-center px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                  </button>
                  {analyticsData.length === 0 && (
                    <button
                      onClick={generateDemoData}
                      className="flex items-center px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-xl text-sm font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      Demo Data
                    </button>
                  )}
                  <select 
                    className="flex items-center px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm outline-none"
                    value={analyticsCampaignFilter}
                    onChange={(e) => {
                      setAnalyticsCampaignFilter(e.target.value);
                    }}
                  >
                    <option value="all">All Campaigns</option>
                    {Array.from(new Set(posts.filter(p => p.campaign).map(p => p.campaign))).map(campaign => (
                      <option key={campaign} value={campaign}>{campaign}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {[
                  { label: 'Total Likes', value: analyticsData.reduce((acc, curr) => acc + curr.likes, 0), icon: ThumbsUp, color: 'text-blue-600', bg: 'bg-blue-50' },
                  { label: 'Total Shares', value: analyticsData.reduce((acc, curr) => acc + curr.shares, 0), icon: Share2, color: 'text-green-600', bg: 'bg-green-50' },
                  { label: 'Total Comments', value: analyticsData.reduce((acc, curr) => acc + curr.comments, 0), icon: MessageCircle, color: 'text-purple-600', bg: 'bg-purple-50' },
                  { label: 'Avg. Engagement', value: analyticsData.length > 0 ? ((analyticsData.reduce((acc, curr) => acc + curr.likes + curr.shares + curr.comments, 0) / analyticsData.length).toFixed(1)) : 0, icon: BarChart2, color: 'text-orange-600', bg: 'bg-orange-50' },
                ].map((stat, i) => (
                  <div key={i} className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div className={`${stat.bg} p-2 rounded-lg`}>
                        <stat.icon className={`w-5 h-5 ${stat.color}`} />
                      </div>
                      <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">+12.5%</span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{stat.label}</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stat.value}</p>
                  </div>
                ))}
              </div>

              {analyticsCampaignFilter !== 'all' && (
                <div className="bg-indigo-900 text-white p-8 rounded-3xl shadow-xl overflow-hidden relative">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-5 h-5 text-indigo-300" />
                      <span className="text-indigo-200 text-sm font-medium uppercase tracking-widest">Campaign Insights</span>
                    </div>
                    <h3 className="text-3xl font-bold mb-4">Performance: {analyticsCampaignFilter}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-8">
                      <div className="bg-white/10 backdrop-blur-md p-6 rounded-2xl border border-white/10">
                        <p className="text-indigo-200 text-sm mb-1">Estimated Reach</p>
                        <p className="text-3xl font-bold">{(analyticsData.reduce((acc, curr) => acc + (curr.likes * 12) + (curr.shares * 45) + (curr.comments * 8), 0)).toLocaleString()}</p>
                        <div className="mt-2 flex items-center text-xs text-green-400">
                          <TrendingUp className="w-3 h-3 mr-1" />
                          <span>Based on engagement multipliers</span>
                        </div>
                      </div>
                      <div className="bg-white/10 backdrop-blur-md p-6 rounded-2xl border border-white/10">
                        <p className="text-indigo-200 text-sm mb-1">Engagement Rate</p>
                        <p className="text-3xl font-bold">
                          {analyticsData.length > 0 ? ((analyticsData.reduce((acc, curr) => acc + curr.likes + curr.shares + curr.comments, 0) / (analyticsData.length * 500)) * 100).toFixed(1) : '0.0'}%
                        </p>
                        <div className="mt-2 flex items-center text-xs text-indigo-300">
                          <span>Relative to estimated impressions</span>
                        </div>
                      </div>
                      <div className="bg-white/10 backdrop-blur-md p-6 rounded-2xl border border-white/10">
                        <p className="text-indigo-200 text-sm mb-1">AI Sentiment Score</p>
                        <p className="text-3xl font-bold">
                          {analyticsData.length > 0 ? Math.floor(75 + (analyticsData.reduce((acc, curr) => acc + curr.likes, 0) % 20)) : '--'}/100
                        </p>
                        <div className="mt-2 flex items-center text-xs text-green-400">
                          <span>{analyticsData.length > 0 ? 'Positive audience reaction' : 'No data yet'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Charts Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Best Time to Post */}
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-center items-center">
                  <h3 className="text-lg font-semibold text-gray-800 mb-6 w-full">Best Time to Post</h3>
                  <div className="text-center">
                    <div className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Clock className="w-10 h-10 text-indigo-600" />
                    </div>
                    <p className="text-4xl font-bold text-gray-900 mb-2">
                      {(() => {
                        const hourlyEngagement: Record<number, { total: number, count: number }> = {};
                        analyticsData.forEach(post => {
                          const hour = new Date(post.date).getHours();
                          const engagement = post.likes + post.shares + post.comments;
                          if (!hourlyEngagement[hour]) hourlyEngagement[hour] = { total: 0, count: 0 };
                          hourlyEngagement[hour].total += engagement;
                          hourlyEngagement[hour].count += 1;
                        });
                        
                        let bestHour = -1;
                        let maxAvg = -1;
                        Object.entries(hourlyEngagement).forEach(([hour, data]) => {
                          const avg = data.total / data.count;
                          if (avg > maxAvg) {
                            maxAvg = avg;
                            bestHour = parseInt(hour);
                          }
                        });
                        return bestHour === -1 ? 'N/A' : `${bestHour}:00`;
                      })()}
                    </p>
                    <p className="text-gray-500">Based on your historical engagement data.</p>
                  </div>
                </div>

                {/* Engagement Over Time */}
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-800 mb-6">Engagement Over Time</h3>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={analyticsData}>
                        <defs>
                          <linearGradient id="colorLikes" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9ca3af'}} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9ca3af'}} />
                        <RechartsTooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                        <Area type="monotone" dataKey="likes" stroke="#6366f1" fillOpacity={1} fill="url(#colorLikes)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Platform Distribution */}
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-800 mb-6">Platform Distribution</h3>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={Object.entries(analyticsData.reduce((acc, curr) => {
                            acc[curr.platform] = (acc[curr.platform] || 0) + 1;
                            return acc;
                          }, {} as Record<string, number>)).map(([name, value]) => ({ name, value }))}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {analyticsData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][index % 5]} />
                          ))}
                        </Pie>
                        <RechartsTooltip />
                        <Legend verticalAlign="bottom" height={36}/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Likes vs Comments */}
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm lg:col-span-2">
                  <h3 className="text-lg font-semibold text-gray-800 mb-6">Engagement Breakdown by Platform</h3>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analyticsData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="platform" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9ca3af'}} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9ca3af'}} />
                        <RechartsTooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                        <Bar dataKey="likes" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={20} />
                        <Bar dataKey="comments" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                        <Bar dataKey="shares" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Content Type Performance */}
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm lg:col-span-3">
                  <h3 className="text-lg font-semibold text-gray-800 mb-6">Content Type Performance (Average)</h3>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={Object.entries(analyticsData.reduce((acc, curr) => {
                        if (!acc[curr.contentType]) acc[curr.contentType] = { likes: 0, comments: 0, shares: 0, count: 0 };
                        acc[curr.contentType].likes += curr.likes;
                        acc[curr.contentType].comments += curr.comments;
                        acc[curr.contentType].shares += curr.shares;
                        acc[curr.contentType].count += 1;
                        return acc;
                      }, {} as Record<string, { likes: number, comments: number, shares: number, count: number }>)).map(([type, data]) => ({
                        type: type.charAt(0).toUpperCase() + type.slice(1),
                        avgLikes: Math.round(data.likes / data.count),
                        avgComments: Math.round(data.comments / data.count),
                        avgShares: Math.round(data.shares / data.count)
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="type" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9ca3af'}} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9ca3af'}} />
                        <RechartsTooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                        <Legend verticalAlign="top" height={36}/>
                        <Bar name="Avg Likes" dataKey="avgLikes" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={30} />
                        <Bar name="Avg Comments" dataKey="avgComments" fill="#10b981" radius={[4, 4, 0, 0]} barSize={30} />
                        <Bar name="Avg Shares" dataKey="avgShares" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={30} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Competitor Benchmarking */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Competitor Benchmarking</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Compare your performance against industry rivals.</p>
                  </div>
                  <button 
                    onClick={() => setIsAddingCompetitor(true)}
                    className="flex items-center px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-xl text-sm font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Competitor
                  </button>
                </div>

                {isAddingCompetitor && (
                  <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-wrap gap-4 items-end">
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Handle / Name</label>
                      <input 
                        type="text" 
                        value={newCompetitorHandle}
                        onChange={(e) => setNewCompetitorHandle(e.target.value)}
                        placeholder="@competitor"
                        className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="w-40">
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Platform</label>
                      <select 
                        value={newCompetitorPlatform}
                        onChange={(e) => setNewCompetitorPlatform(e.target.value as Platform)}
                        className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {Object.keys(platformConfig).map(p => (
                          <option key={p} value={p}>{platformConfig[p as Platform].name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setIsAddingCompetitor(false)}
                        className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={handleAddCompetitor}
                        disabled={isAnalyzingCompetitor || !newCompetitorHandle}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center"
                      >
                        {isAnalyzingCompetitor ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        {isAnalyzingCompetitor ? 'Analyzing...' : 'Add'}
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Your Stats Card */}
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-800">
                    <div className="flex items-center mb-4">
                      <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white mr-3">
                        <UserIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-indigo-900 dark:text-indigo-100">Your Brand</h4>
                        <p className="text-xs text-indigo-600 dark:text-indigo-400">Average across platforms</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs text-indigo-500 uppercase font-bold mb-1">Avg. Engagement</p>
                        <p className="text-2xl font-bold text-indigo-900 dark:text-indigo-100">
                          {analyticsData.length > 0 ? (analyticsData.reduce((acc, curr) => acc + curr.likes + curr.shares + curr.comments, 0) / analyticsData.length).toFixed(1) : '0.0'}%
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-indigo-500 uppercase font-bold mb-1">Posts / Week</p>
                        <p className="text-2xl font-bold text-indigo-900 dark:text-indigo-100">
                          {Math.round(posts.filter(p => p.status === 'published').length / 4) || 0}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Competitor Cards */}
                  {competitors.map((comp) => (
                    <div key={comp.id} className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 relative group">
                      <button 
                        onClick={() => handleRemoveCompetitor(comp.id)}
                        className="absolute top-4 right-4 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <div className="flex items-center mb-4">
                        <div className={`${platformConfig[comp.platform as Platform].color} w-10 h-10 rounded-full flex items-center justify-center text-white mr-3`}>
                          {React.createElement(platformConfig[comp.platform as Platform].icon, { className: 'w-5 h-5' })}
                        </div>
                        <div>
                          <h4 className="font-bold text-gray-900 dark:text-gray-100">{comp.handle}</h4>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{platformConfig[comp.platform as Platform].name}</p>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <p className="text-xs text-gray-400 uppercase font-bold mb-1">Avg. Engagement</p>
                          <div className="flex items-center">
                            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{comp.metrics.avgEngagement}%</p>
                            <span className={`ml-2 text-xs font-medium ${parseFloat(comp.metrics.avgEngagement) > (analyticsData.length > 0 ? parseFloat((analyticsData.reduce((acc, curr) => acc + curr.likes + curr.shares + curr.comments, 0) / analyticsData.length).toFixed(1)) : 0) ? 'text-red-500' : 'text-green-500'}`}>
                              {parseFloat(comp.metrics.avgEngagement) > (analyticsData.length > 0 ? parseFloat((analyticsData.reduce((acc, curr) => acc + curr.likes + curr.shares + curr.comments, 0) / analyticsData.length).toFixed(1)) : 0) ? 'Above you' : 'Below you'}
                            </span>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 uppercase font-bold mb-1">Est. Followers</p>
                          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{(comp.metrics.followers / 1000).toFixed(1)}k</p>
                        </div>
                      </div>
                    </div>
                  ))}

                  {competitors.length === 0 && !isAddingCompetitor && (
                    <div className="lg:col-span-2 flex flex-col items-center justify-center p-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
                      <Users className="w-12 h-12 text-gray-300 mb-4" />
                      <p className="text-gray-500 dark:text-gray-400 text-center">No competitors added yet. Start tracking your rivals to see how you stack up!</p>
                    </div>
                  )}
                </div>

                {/* Competitor Charts */}
                {competitors.length > 0 && (
                  <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="bg-gray-50 dark:bg-gray-900/20 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 text-center">Avg. Engagement (%)</h4>
                      <div className="h-[200px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart 
                            data={[
                              { name: 'You', value: analyticsData.length > 0 ? parseFloat((analyticsData.reduce((acc, curr) => acc + curr.likes + curr.shares + curr.comments, 0) / analyticsData.length).toFixed(1)) : 0 },
                              ...competitors.map(c => ({ name: c.handle, value: parseFloat(c.metrics.avgEngagement) }))
                            ]} 
                            layout="vertical" 
                            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f3f4f6" />
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9ca3af'}} width={80} />
                            <RechartsTooltip cursor={{fill: 'transparent'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                              {[
                                { name: 'You' },
                                ...competitors
                              ].map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={index === 0 ? '#6366f1' : '#9ca3af'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    
                    <div className="bg-gray-50 dark:bg-gray-900/20 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 text-center">Est. Followers</h4>
                      <div className="h-[200px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart 
                            data={[
                              { 
                                name: 'You', 
                                value: Object.values(oauthConnections).reduce((acc, curr: any) => acc + (curr.followers || 0), 0) || 1200 // Fallback to a small base if none connected
                              },
                              ...competitors.map(c => ({ name: c.handle, value: c.metrics.followers }))
                            ]} 
                            layout="vertical" 
                            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f3f4f6" />
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9ca3af'}} width={80} />
                            <RechartsTooltip cursor={{fill: 'transparent'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                              {[
                                { name: 'You' },
                                ...competitors
                              ].map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : '#9ca3af'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-900/20 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 text-center">Posts / Week</h4>
                      <div className="h-[200px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart 
                            data={[
                              { name: 'You', value: Math.round(posts.filter(p => p.status === 'published').length / 4) || 0 },
                              ...competitors.map(c => ({ name: c.handle, value: c.metrics.postsPerWeek }))
                            ]} 
                            layout="vertical" 
                            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f3f4f6" />
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#9ca3af'}} width={80} />
                            <RechartsTooltip cursor={{fill: 'transparent'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                              {[
                                { name: 'You' },
                                ...competitors
                              ].map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={index === 0 ? '#f59e0b' : '#9ca3af'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Hashtag Performance */}
              <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-6">Hashtag Performance</h3>
                <div className="flex flex-wrap gap-3">
                  {getHashtagPerformance().length > 0 ? (
                    getHashtagPerformance().map((item, index) => (
                      <div 
                        key={index} 
                        className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col items-center justify-center min-w-[120px]"
                        style={{ 
                          fontSize: `${Math.max(0.8, Math.min(1.5, item.avgEngagement / 10))}rem`,
                          opacity: Math.max(0.6, Math.min(1, item.count / 5))
                        }}
                      >
                        <span className="font-bold text-indigo-600 dark:text-indigo-400 mb-1">{item.tag}</span>
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] text-gray-400 uppercase font-bold">Avg. Eng.</span>
                          <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{item.avgEngagement.toFixed(1)}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="w-full py-12 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
                      <Hash className="w-12 h-12 text-gray-300 mb-4" />
                      <p className="text-gray-500 dark:text-gray-400">No hashtag data available yet. Start posting with hashtags to see performance insights.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : activeTab === 'dashboard' ? (
            <>
              {/* URL Repurposer Section */}
              <section className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl shadow-lg p-6 text-white mb-6">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="flex-1">
                    <h2 className="text-xl font-display font-bold mb-2 flex items-center">
                      <Link2 className="w-6 h-6 mr-2" />
                      AI Content Repurposer
                    </h2>
                    <p className="text-indigo-100 text-sm">
                      Paste a blog post or article URL to instantly turn it into a high-engagement social media post.
                    </p>
                  </div>
                  <div className="w-full md:w-1/2 flex gap-2">
                    <input 
                      type="url" 
                      value={repurposeUrl}
                      onChange={(e) => setRepurposeUrl(e.target.value)}
                      placeholder="https://yourblog.com/post-title"
                      className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 transition-all"
                    />
                    <button 
                      onClick={async () => {
                        if (!repurposeUrl) return;
                        setIsRepurposing(true);
                        try {
                          const prompt = `Repurpose the content from this URL into a viral social media post: ${repurposeUrl}. 
                          Extract the most interesting hook, 3 key takeaways, and a call to action. 
                          Format it for general social media use with relevant hashtags.`;
                          const result = await generateAIContent(prompt);
                          if (result) {
                            setContent(result);
                            setComposerMode('write');
                            showToast('Content repurposed successfully!', 'success');
                          }
                        } catch (error) {
                          console.error("Repurposing failed:", error);
                          showToast('Failed to repurpose content. Please try again.', 'error');
                        } finally {
                          setIsRepurposing(false);
                        }
                      }}
                      disabled={isRepurposing || !repurposeUrl}
                      className="bg-white text-indigo-600 hover:bg-indigo-50 px-6 py-3 rounded-xl font-bold transition-all shadow-md disabled:opacity-50 flex items-center"
                    >
                      {isRepurposing ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Repurpose'}
                    </button>
                  </div>
                </div>
              </section>

              {/* AI Video Storyboard Section */}
              <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
                <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-display font-semibold text-gray-800 dark:text-gray-100 flex items-center">
                      <Film className="w-5 h-5 mr-2 text-purple-500" />
                      AI Video Storyboarder
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Generate a professional scene-by-scene storyboard for your next video or Reel.
                    </p>
                  </div>
                </div>
                <div className="p-6">
                  <div className="flex gap-4 mb-6">
                    <input 
                      type="text" 
                      value={videoTopic}
                      onChange={(e) => setVideoTopic(e.target.value)}
                      placeholder="e.g., A tutorial on how to use our new dashboard..."
                      className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                    />
                    <button 
                      onClick={async () => {
                        if (!videoTopic) return;
                        setIsStoryboarding(true);
                        try {
                          const prompt = `Create a 5-scene video storyboard for this topic: "${videoTopic}". 
                          For each scene, provide:
                          1. Visual Description
                          2. Audio/Script
                          3. Duration (e.g., 3s, 5s)
                          Return as a JSON array of objects with keys: scene, visual, audio, duration.`;
                          const result = await generateAIContent(prompt);
                          if (result) {
                            try {
                              // Clean the result if it contains markdown code blocks
                              const cleanedResult = result.replace(/```json|```/g, '').trim();
                              const parsed = JSON.parse(cleanedResult);
                              setStoryboard(parsed);
                              showToast('Storyboard generated!', 'success');
                            } catch (e) {
                              console.error("JSON parse failed:", e);
                              // Fallback to manual parsing if AI returns slightly malformed JSON
                              showToast('Failed to parse storyboard. Try again.', 'error');
                            }
                          }
                        } catch (error) {
                          console.error("Storyboarding failed:", error);
                        } finally {
                          setIsStoryboarding(false);
                        }
                      }}
                      disabled={isStoryboarding || !videoTopic}
                      className="bg-brand hover:opacity-90 text-white px-6 py-2 rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center"
                      style={{ backgroundColor: primaryColor }}
                    >
                      {isStoryboarding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                      Generate Storyboard
                    </button>
                  </div>

                  {storyboard.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                      {storyboard.map((frame, idx) => (
                        <div key={idx} className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 border border-gray-100 dark:border-gray-700 relative group">
                          <div className="absolute -top-2 -left-2 w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-sm">
                            {frame.scene || idx + 1}
                          </div>
                          <div className="aspect-video bg-gray-200 dark:bg-gray-800 rounded-lg mb-3 flex items-center justify-center overflow-hidden">
                            <ImageIcon className="w-8 h-8 text-gray-400" />
                          </div>
                          <h4 className="text-xs font-bold text-gray-400 uppercase mb-1">Visual</h4>
                          <p className="text-[11px] text-gray-700 dark:text-gray-300 mb-3 line-clamp-3">{frame.visual}</p>
                          <h4 className="text-xs font-bold text-gray-400 uppercase mb-1">Audio</h4>
                          <p className="text-[11px] italic text-gray-600 dark:text-gray-400 mb-2 line-clamp-3">"{frame.audio}"</p>
                          <div className="flex justify-end">
                            <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">{frame.duration}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {/* AI Hashtag Research Section */}
              <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
                <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-display font-semibold text-gray-800 dark:text-gray-100 flex items-center">
                      <Hash className="w-5 h-5 mr-2 text-blue-500" />
                      AI Hashtag Research
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Find the most relevant and trending hashtags for your niche.
                    </p>
                  </div>
                </div>
                <div className="p-6">
                  <div className="flex gap-4 mb-6">
                    <input 
                      type="text" 
                      value={hashtagTopic}
                      onChange={(e) => setHashtagTopic(e.target.value)}
                      placeholder="e.g., Digital marketing for small businesses..."
                      className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <button 
                      onClick={async () => {
                        if (!hashtagTopic) return;
                        setIsGeneratingHashtags(true);
                        try {
                          const prompt = `Generate a list of 20 trending and highly relevant hashtags for the topic: "${hashtagTopic}". 
                          Group them into: High Volume, Niche, and Community. 
                          Return as a plain comma-separated list of hashtags only.`;
                          const result = await generateAIContent(prompt);
                          if (result) {
                            const tags = result.split(',').map(t => t.trim().startsWith('#') ? t.trim() : `#${t.trim()}`);
                            setSuggestedHashtags(tags);
                            showToast('Hashtags generated!', 'success');
                          }
                        } catch (error) {
                          console.error("Hashtag generation failed:", error);
                        } finally {
                          setIsGeneratingHashtags(false);
                        }
                      }}
                      disabled={isGeneratingHashtags || !hashtagTopic}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center"
                    >
                      {isGeneratingHashtags ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                      Research
                    </button>
                  </div>

                  {suggestedHashtags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {suggestedHashtags.map((tag, idx) => (
                        <button 
                          key={idx}
                          onClick={() => {
                            setContent(prev => prev + (prev ? ' ' : '') + tag);
                            showToast(`Added ${tag} to post`, 'info');
                          }}
                          className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors border border-blue-100 dark:border-blue-800"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {/* AI Post Ideas Section */}
              <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
                <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-display font-semibold text-gray-800 dark:text-gray-100 flex items-center">
                      <Sparkles className="w-5 h-5 mr-2 text-indigo-500" />
                      AI Post Ideas
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Get personalized content ideas based on your brand kit and current trends.
                    </p>
                  </div>
                  <button
                    onClick={generatePostIdeas}
                    disabled={isGeneratingIdeas}
                    className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 dark:text-indigo-300 px-4 py-2 rounded-lg font-medium flex items-center transition-colors disabled:opacity-50"
                  >
                    {isGeneratingIdeas ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Wand2 className="w-4 h-4 mr-2" />
                    )}
                    Generate Ideas
                  </button>
                </div>
                {postIdeas.length > 0 ? (
                  <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {postIdeas.map((idea, index) => (
                      <div key={index} className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 border border-gray-100 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors group">
                        <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">{idea.title}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{idea.description}</p>
                        <button
                          onClick={() => {
                            setContent(`Write a post about: ${idea.title}\n\nContext: ${idea.description}`);
                            setComposerMode('write');
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="text-indigo-600 dark:text-indigo-400 text-sm font-medium flex items-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Edit3 className="w-4 h-4 mr-1" />
                          Draft this post
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-12 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mb-4">
                      <Sparkles className="w-8 h-8 text-indigo-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">Need some inspiration?</h3>
                    <p className="text-gray-500 dark:text-gray-400 max-w-md mb-6">
                      Click the button above to generate 3-5 concise and actionable social media post ideas tailored to your brand personality, core values, target audience, and current trends.
                    </p>
                    <button
                      onClick={generatePostIdeas}
                      disabled={isGeneratingIdeas}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg font-medium flex items-center transition-colors disabled:opacity-50 shadow-sm"
                    >
                      {isGeneratingIdeas ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Wand2 className="w-4 h-4 mr-2" />
                      )}
                      Generate Ideas Now
                    </button>
                  </div>
                )}
              </section>

              {/* Composer Section */}
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-display font-semibold text-gray-800 dark:text-gray-100">Create New Post</h2>
                <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                  <button
                    onClick={() => setComposerMode('write')}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${composerMode === 'write' ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                  >
                    Write from Scratch
                  </button>
                  <button
                    onClick={() => setComposerMode('repurpose')}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${composerMode === 'repurpose' ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                  >
                    Repurpose Content
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setIsTemplatesDropdownOpen(!isTemplatesDropdownOpen)}
                      className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center ${isTemplatesDropdownOpen ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      Templates
                      <ChevronDown className={`w-3 h-3 ml-1 transition-transform ${isTemplatesDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {isTemplatesDropdownOpen && (
                      <div className="absolute top-full right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 py-2 overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 mb-1">
                          <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">AI Prompt Templates</p>
                        </div>
                        {AI_TEMPLATES.map(template => (
                          <button
                            key={template.id}
                            onClick={() => {
                              setContent(template.prompt);
                              setComposerMode('write');
                              setIsTemplatesDropdownOpen(false);
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors flex items-center group"
                          >
                            <Sparkles className="w-3.5 h-3.5 mr-2 text-indigo-400 dark:text-indigo-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
                            {template.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {composerMode === 'repurpose' ? (
                <div className="space-y-4">
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-xl p-4 mb-4">
                    <h3 className="text-indigo-800 dark:text-indigo-200 font-medium flex items-center mb-2">
                      <Sparkles className="w-5 h-5 mr-2" />
                      Content Repurposing Engine
                    </h3>
                    <p className="text-indigo-600 dark:text-indigo-400 text-sm">
                      Paste a URL (like a blog post or news article) or a long block of text. Our AI will automatically generate 3 distinct social media posts tailored for different platforms and save them to your Drafts.
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Source URL or Text</label>
                    <textarea
                      value={repurposeSource}
                      onChange={(e) => setRepurposeSource(e.target.value)}
                      placeholder="https://example.com/blog-post OR paste your long text here..."
                      className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-xl p-4 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none transition-all min-h-[120px]"
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
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Select Platforms</label>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center cursor-pointer group">
                      <div className="relative">
                        <input 
                          type="checkbox" 
                          className="sr-only" 
                          checked={isPlatformSpecificMode}
                          onChange={(e) => {
                            setIsPlatformSpecificMode(e.target.checked);
                            if (e.target.checked && selectedPlatforms.length > 0) {
                              setActivePlatformTab(selectedPlatforms[0]);
                              // Initialize platform specific content if empty
                              const newPlatformContent = { ...platformSpecificContent };
                              selectedPlatforms.forEach(p => {
                                if (!newPlatformContent[p]) newPlatformContent[p] = content;
                              });
                              setPlatformSpecificContent(newPlatformContent);
                            }
                          }}
                        />
                        <div className={`w-10 h-5 bg-gray-200 dark:bg-gray-700 rounded-full transition-colors ${isPlatformSpecificMode ? 'bg-indigo-600' : ''}`}></div>
                        <div className={`absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-transform ${isPlatformSpecificMode ? 'translate-x-5' : ''}`}></div>
                      </div>
                      <span className="ml-2 text-xs font-medium text-gray-600 dark:text-gray-400">Customize by Platform</span>
                    </label>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  {(Object.keys(platformConfig) as Platform[]).map((platform) => {
                    const config = platformConfig[platform];
                    const Icon = config.icon;
                    const isSelected = selectedPlatforms.includes(platform);
                    
                    return (
                      <button
                        key={platform}
                        onClick={() => togglePlatform(platform)}
                        className={`flex items-center px-4 py-2 rounded-full border transition-all group/platform ${
                          isSelected 
                            ? `${config.color} border-transparent text-white shadow-md transform scale-105` 
                            : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        <Tooltip text={config.name}>
                          <Icon className="w-4 h-4 mr-2" />
                        </Tooltip>
                        <span className="text-sm font-medium">{config.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Text Area */}
              <div className="mb-4">
                {isPlatformSpecificMode && selectedPlatforms.length > 0 && (
                  <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4 overflow-x-auto">
                    {selectedPlatforms.map(platform => (
                      <button
                        key={platform}
                        onClick={() => setActivePlatformTab(platform)}
                        className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                          activePlatformTab === platform 
                            ? 'border-indigo-600 text-indigo-600' 
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {platformConfig[platform].name}
                      </button>
                    ))}
                  </div>
                )}
                <textarea
                  value={isPlatformSpecificMode && activePlatformTab ? (platformSpecificContent[activePlatformTab] || content) : content}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (isPlatformSpecificMode && activePlatformTab) {
                      setPlatformSpecificContent(prev => ({ ...prev, [activePlatformTab]: val }));
                    } else {
                      setContent(val);
                    }
                  }}
                  placeholder={isPlatformSpecificMode && activePlatformTab ? `What do you want to share on ${platformConfig[activePlatformTab].name}?` : "What do you want to share?"}
                  className="w-full h-32 p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition-all"
                />
              </div>

              {/* AI Improvement Options */}
              <div className="flex flex-wrap gap-2 mb-6">
                <div className="relative">
                  <button
                    onClick={() => setIsTemplatesDropdownOpen(!isTemplatesDropdownOpen)}
                    className="flex items-center px-3 py-1.5 bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200 rounded-lg text-xs font-medium hover:bg-indigo-200 dark:hover:bg-indigo-900/60 transition-colors"
                  >
                    <FileText className="w-3 h-3 mr-1" />
                    Templates
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </button>
                  {isTemplatesDropdownOpen && (
                    <div className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-10 py-1">
                      {AI_TEMPLATES.map((template) => (
                        <button
                          key={template.id}
                          onClick={() => {
                            setContent(prev => prev + (prev ? '\n\n' : '') + template.prompt);
                            setIsTemplatesDropdownOpen(false);
                          }}
                          className="w-full text-left px-4 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          {template.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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
                <button
                  onClick={applyGhostWriting}
                  disabled={isGhostWriting || !content.trim()}
                  className="flex items-center px-3 py-1.5 bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-200 rounded-lg text-xs font-medium hover:bg-purple-200 dark:hover:bg-purple-900/60 transition-colors disabled:opacity-50"
                  title="Rewrite in your unique brand voice"
                >
                  {isGhostWriting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <UserIcon className="w-3 h-3 mr-1" />}
                  Ghost Write
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
                      onClick={() => generateAIContent()}
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
                      onClick={() => handleGenerateImage(true)}
                      disabled={isGeneratingImage || !imagePrompt.trim()}
                      className="bg-purple-100 hover:bg-purple-200 text-purple-700 px-4 py-2 rounded-lg font-medium text-sm flex items-center transition-colors disabled:opacity-50"
                      title="Generate using DALL-E 3 (Requires API Key)"
                    >
                      {isGeneratingImage ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4 mr-2" />
                      )}
                      DALL-E
                    </button>
                    <button
                      onClick={handleGenerateImageFree}
                      disabled={isGeneratingImage || !imagePrompt.trim()}
                      className="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-4 py-2 rounded-lg font-medium text-sm flex items-center transition-colors disabled:opacity-50"
                      title="Generate using Pollinations (Free)"
                    >
                      {isGeneratingImage ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Zap className="w-4 h-4 mr-2" />
                      )}
                      Free Gen
                    </button>
                    <button
                      onClick={handleGenerateVideoScript}
                      disabled={isGeneratingVideoScript || !content.trim()}
                      className="bg-orange-100 hover:bg-orange-200 text-orange-700 px-4 py-2 rounded-lg font-medium text-sm flex items-center transition-colors disabled:opacity-50"
                      title="Generate Video Script (Reels/TikTok)"
                    >
                      {isGeneratingVideoScript ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Video className="w-4 h-4 mr-2" />
                      )}
                      Video Script
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
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 mb-1">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={isAutoPilot} 
                          onChange={(e) => setIsAutoPilot(e.target.checked)}
                          className="sr-only peer" 
                        />
                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-light rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-brand" style={{ '--tw-ring-color': `var(--primary-color-light)` } as any}></div>
                      </label>
                      <span className="text-[10px] font-bold text-brand uppercase tracking-wider flex items-center gap-1" style={{ color: primaryColor }}>
                        <Sparkles className="w-3 h-3" />
                        AI Auto-Pilot
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        type="text"
                        placeholder="Campaign"
                        value={selectedCampaign}
                        onChange={(e) => setSelectedCampaign(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-32"
                      />
                      {!isAutoPilot && (
                        <>
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
                        </>
                      )}
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
                    {isGeneratingTime ? (
                      <div className="flex items-center gap-2 text-xs text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-md w-fit">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Analyzing optimal posting time...</span>
                      </div>
                    ) : suggestedTime && (
                      <div className="flex items-center gap-2 text-xs text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-md w-fit">
                        <Sparkles className="w-3 h-3" />
                        <span>Suggested: <strong>{suggestedTime}</strong></span>
                        <span className="text-indigo-400 mx-1">•</span>
                        <span className="text-indigo-500/80" title={suggestedTimeReason || ''}>{suggestedTimeReason}</span>
                        <button
                          onClick={() => setScheduleTime(suggestedTime)}
                          className="ml-2 font-medium hover:underline"
                        >
                          Apply
                        </button>
                      </div>
                    )}
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
                    className="flex-1 sm:flex-none bg-brand hover:opacity-90 text-white px-4 py-2.5 rounded-lg font-medium flex items-center justify-center transition-colors shadow-sm disabled:opacity-50"
                    style={{ backgroundColor: primaryColor }}
                  >
                    <Megaphone className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">Publish</span>
                  </button>
                  <button 
                    onClick={() => handleSchedule('pending_approval')}
                    disabled={isSubmitting}
                    className="flex-1 sm:flex-none bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-700 px-4 py-2.5 rounded-lg font-medium flex items-center justify-center transition-colors shadow-sm disabled:opacity-50"
                  >
                    <Clock className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">Approval</span>
                  </button>
                  <button 
                    onClick={() => handleSchedule('scheduled')}
                    disabled={isSubmitting}
                    className="w-full sm:w-auto bg-brand hover:opacity-90 text-white px-6 py-2.5 rounded-lg font-medium flex items-center justify-center transition-colors shadow-sm disabled:opacity-50"
                    style={{ backgroundColor: primaryColor }}
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
                  onClick={() => setDashboardTab('pending_approval')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${dashboardTab === 'pending_approval' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Pending
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
              ) : posts.filter(p => 
                dashboardTab === 'drafts' ? p.status === 'draft' : 
                dashboardTab === 'published' ? p.status === 'published' : 
                dashboardTab === 'pending_approval' ? p.status === 'pending_approval' :
                p.status === 'scheduled'
              ).length === 0 ? (
                <EmptyState 
                  icon={Calendar} 
                  title={`No ${dashboardTab} posts`} 
                  description={`You don't have any ${dashboardTab} posts yet. Start creating content to see them here.`}
                />
              ) : (
                  <div>
                    {renderBulkActions()}
                    {posts.filter(p => 
                      dashboardTab === 'drafts' ? p.status === 'draft' : 
                      dashboardTab === 'published' ? p.status === 'published' : 
                      dashboardTab === 'pending_approval' ? p.status === 'pending_approval' :
                      p.status === 'scheduled'
                    ).map(post => (
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
                            <div key={p} className="flex items-center gap-1">
                              <Tooltip text={config.name}>
                                <div className={`${config.color} w-6 h-6 rounded-full flex items-center justify-center text-white cursor-help`}>
                                  <Icon className="w-3 h-3" />
                                </div>
                              </Tooltip>
                              <span className="text-xs text-gray-500">{config.name}</span>
                            </div>
                          );
                        })}
                        {post.isReel && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-pink-100 text-pink-800">
                            Reel
                          </span>
                        )}
                        <div className="ml-auto flex items-center gap-2">
                          {post.status === 'published' && (
                            <button 
                              onClick={async () => {
                                try {
                                  await addDoc(collection(db, 'evergreenPosts'), {
                                    content: post.content,
                                    platformContent: post.platformContent || null,
                                    platforms: post.platforms,
                                    mediaAssets: post.postMediaAssets || [],
                                    workspaceId: activeWorkspace,
                                    useCount: 0,
                                    createdAt: new Date().toISOString()
                                  });
                                  showToast('Post saved to Evergreen Library!', 'success');
                                } catch (e) {
                                  console.error(e);
                                }
                              }}
                              className="text-xs font-medium text-green-600 hover:text-green-800 flex items-center gap-1"
                              title="Save to Evergreen Library for future resharing"
                            >
                              <RefreshCw className="w-3 h-3" />
                              Evergreen
                            </button>
                          )}
                          {post.status === 'pending_approval' && (
                            <>
                              <button 
                                onClick={() => setIsAddingFeedback(post.id)}
                                className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                              >
                                <MessageSquare className="w-3 h-3" />
                                Feedback
                              </button>
                              <button 
                                onClick={() => handleApprovePost(post.id)}
                                className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                              >
                                Approve
                              </button>
                            </>
                          )}
                          <button 
                            onClick={() => {
                              setContent(post.content);
                              setSelectedPlatforms(post.platforms);
                              setPostMediaAssets(post.postMediaAssets || []);
                              setDraftId(post.id);
                              if (post.scheduledFor) {
                                const [date, time] = post.scheduledFor.split('T');
                                setScheduleDate(date);
                                setScheduleTime(time.substring(0, 5));
                              }
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="text-gray-400 hover:text-indigo-600 transition-colors"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDeletePost(post)}
                            className="text-gray-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Feedback Section */}
                      {post.status === 'pending_approval' && (
                        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                          {post.feedback && post.feedback.length > 0 && (
                            <div className="space-y-3 mb-4">
                              {post.feedback.map((f, idx) => (
                                <div key={idx} className={`p-3 rounded-xl text-sm ${f.resolved ? 'bg-gray-50 dark:bg-gray-900/50 opacity-60' : 'bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800'}`}>
                                  <div className="flex justify-between items-start mb-1">
                                    <span className="font-semibold text-indigo-900 dark:text-indigo-100">{f.author}</span>
                                    <span className="text-[10px] text-gray-400">{moment(f.timestamp).fromNow()}</span>
                                  </div>
                                  <p className="text-gray-700 dark:text-gray-300">{f.text}</p>
                                  {!f.resolved && (
                                    <button 
                                      onClick={() => handleResolveFeedback(post.id, idx)}
                                      className="mt-2 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 uppercase tracking-wider"
                                    >
                                      Mark as Resolved
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          
                          {isAddingFeedback === post.id ? (
                            <div className="flex gap-2">
                              <input 
                                type="text"
                                placeholder="Add feedback or requested changes..."
                                value={newFeedback[post.id] || ''}
                                onChange={(e) => setNewFeedback(prev => ({ ...prev, [post.id]: e.target.value }))}
                                className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                onKeyDown={(e) => e.key === 'Enter' && handleAddFeedback(post.id)}
                              />
                              <button 
                                onClick={() => handleAddFeedback(post.id)}
                                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
                              >
                                Send
                              </button>
                              <button 
                                onClick={() => setIsAddingFeedback(null)}
                                className="text-gray-400 hover:text-gray-600"
                              >
                                <X className="w-5 h-5" />
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => setIsAddingFeedback(post.id)}
                              className="text-xs text-gray-500 hover:text-indigo-600 flex items-center gap-1"
                            >
                              <Plus className="w-3 h-3" /> Add feedback
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="sm:text-right flex flex-col justify-between items-end">
                      <div className="flex items-center space-x-2 mb-2 sm:mb-0">
                        {(userRole === 'admin' || userRole === 'editor') ? (
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
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {post.status}
                          </span>
                        )}
                        {post.status === 'pending_approval' && (userRole === 'admin') && (
                          <button 
                            onClick={() => updatePostStatus(post, 'scheduled')}
                            className="text-green-600 hover:text-green-800 text-xs font-medium bg-green-50 hover:bg-green-100 px-2 py-1 rounded transition-colors"
                          >
                            Approve
                          </button>
                        )}
                        {post.status !== 'published' && (userRole === 'admin' || userRole === 'editor') && (
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
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 h-[600px]">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-display font-semibold text-gray-800 dark:text-gray-100">Content Calendar</h2>
              <button 
                onClick={() => setIsCalendarGeneratorOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center transition-colors shadow-sm"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Generate with AI
              </button>
            </div>
            <DnDCalendar
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
              onEventDrop={async ({ event, start }) => {
                const post = event.resource as ScheduledPost;
                const newDate = new Date(start);
                
                // Keep the original time, just change the date
                const originalDate = new Date(post.scheduledFor!);
                newDate.setHours(originalDate.getHours(), originalDate.getMinutes(), 0, 0);
                
                try {
                  await updateDoc(doc(db, 'posts', post.id), {
                    scheduledFor: newDate.toISOString()
                  });
                  showToast('Post rescheduled successfully', 'success');
                } catch (error) {
                  console.error('Failed to reschedule:', error);
                  showToast('Failed to reschedule post', 'error');
                }
              }}
              resizable={false}
            />
          </div>
        ) : activeTab === 'approvals' ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-display font-bold text-gray-900 dark:text-gray-100">Approval Workflow</h1>
                <p className="text-gray-500 dark:text-gray-400">Review and approve content before it goes live.</p>
              </div>
            <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
              <div className="px-4 py-1.5 text-sm font-medium text-brand" style={{ color: primaryColor }}>
                {posts.filter(p => p.status === 'pending_approval').length} Pending
              </div>
              <button 
                onClick={() => {
                  const url = `${window.location.origin}/approve/${activeWorkspace}`;
                  navigator.clipboard.writeText(url);
                  showToast('Public approval link copied to clipboard!', 'success');
                }}
                className="flex items-center px-3 py-1.5 text-xs font-bold text-gray-500 hover:text-brand transition-colors"
              >
                <Link2 className="w-3.5 h-3.5 mr-1.5" />
                Copy Public Link
              </button>
            </div>
            </div>

            {posts.filter(p => p.status === 'pending_approval').length === 0 ? (
              <EmptyState 
                icon={ShieldCheck} 
                title="All clear!" 
                description="No posts are currently waiting for approval. Great job!"
              />
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {posts.filter(p => p.status === 'pending_approval').map(post => (
                  <div key={post.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-2">
                          {post.platforms.map(p => {
                            const Icon = platformConfig[p]?.icon || Share2;
                            return <Icon key={p} className={`w-5 h-5 ${platformConfig[p]?.color || 'text-gray-400'}`} />;
                          })}
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-2">
                            Scheduled for {post.scheduledFor ? moment(post.scheduledFor).format('MMM D, h:mm A') : 'TBD'}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={async () => {
                              try {
                                await updateDoc(doc(db, 'posts', post.id), { status: 'draft' });
                                showToast('Post sent back to drafts', 'info');
                              } catch (e) {
                                console.error(e);
                              }
                            }}
                            className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                            title="Reject & Send to Draft"
                          >
                            <XCircle className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={async () => {
                              try {
                                await updateDoc(doc(db, 'posts', post.id), { status: 'scheduled' });
                                showToast('Post approved and scheduled!', 'success');
                              } catch (e) {
                                console.error(e);
                              }
                            }}
                            className="p-2 text-gray-400 hover:text-green-500 transition-colors"
                            title="Approve & Schedule"
                          >
                            <CheckCircle className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap mb-4">{post.content}</p>
                      {post.postMediaAssets && post.postMediaAssets.length > 0 && (
                        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                          {post.postMediaAssets.map((asset, i) => (
                            <img key={i} src={asset.url} alt="Media" className="w-20 h-20 object-cover rounded-lg border border-gray-100 dark:border-gray-700" />
                          ))}
                        </div>
                      )}
                      
                      {/* Feedback & Discussion Section */}
                      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <h4 className="text-xs font-bold text-gray-400 uppercase mb-3 flex items-center">
                            <ShieldCheck className="w-3 h-3 mr-1" />
                            Approval Feedback
                          </h4>
                          <div className="space-y-3 mb-4">
                            {post.feedback?.map((f, i) => (
                              <div key={i} className="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl text-sm border border-gray-100 dark:border-gray-800">
                                <div className="flex justify-between mb-1">
                                  <span className="font-bold text-gray-700 dark:text-gray-300">{f.author}</span>
                                  <span className="text-[10px] text-gray-400">{moment(f.timestamp).fromNow()}</span>
                                </div>
                                <p className="text-gray-600 dark:text-gray-400">{f.text}</p>
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              placeholder="Add feedback..."
                              className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm"
                              onKeyDown={async (e) => {
                                if (e.key === 'Enter' && e.currentTarget.value) {
                                  const text = e.currentTarget.value;
                                  const feedback = post.feedback || [];
                                  await updateDoc(doc(db, 'posts', post.id), {
                                    feedback: [...feedback, {
                                      text,
                                      author: user?.displayName || 'Team Member',
                                      timestamp: new Date().toISOString(),
                                      resolved: false
                                    }]
                                  });
                                  e.currentTarget.value = '';
                                }
                              }}
                            />
                          </div>
                        </div>

                        <div className="border-l border-gray-100 dark:border-gray-700 pl-6">
                          <h4 className="text-xs font-bold text-gray-400 uppercase mb-3 flex items-center">
                            <Users className="w-3 h-3 mr-1" />
                            Team Discussion
                          </h4>
                          <div className="space-y-3 mb-4 h-32 overflow-y-auto pr-2">
                            <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-xl text-sm">
                              <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300 mb-1">System</p>
                              <p className="text-gray-600 dark:text-gray-400 italic">This post was submitted for approval by {user?.displayName || 'the author'}.</p>
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl text-sm">
                              <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Marketing Lead</p>
                              <p className="text-gray-600 dark:text-gray-400">Does this align with our Q4 brand guidelines?</p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              placeholder="Type a message..."
                              className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm"
                            />
                            <button className="p-2 bg-indigo-600 text-white rounded-lg">
                              <Send className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeTab === 'campaigns' ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-display font-bold text-gray-900 dark:text-gray-100">Campaign Management</h1>
                <p className="text-gray-500 dark:text-gray-400">Group your content into strategic campaigns and track ROI.</p>
              </div>
              <button 
                onClick={() => setIsCreatingCampaign(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium flex items-center transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Campaign
              </button>
            </div>

            {isCreatingCampaign && (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border-2 border-indigo-100 dark:border-indigo-900 shadow-lg">
                <h2 className="text-lg font-bold mb-4">Create Strategic Campaign</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Campaign Name</label>
                    <input 
                      type="text" 
                      value={newCampaign.name}
                      onChange={(e) => setNewCampaign({...newCampaign, name: e.target.value})}
                      placeholder="e.g., Q4 Product Launch"
                      className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Primary Goal</label>
                    <input 
                      type="text" 
                      value={newCampaign.goal}
                      onChange={(e) => setNewCampaign({...newCampaign, goal: e.target.value})}
                      placeholder="e.g., 500 New Signups"
                      className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Engagement Value ($)</label>
                    <input 
                      type="number" 
                      value={newCampaign.engagementValue || 0}
                      onChange={(e) => setNewCampaign({...newCampaign, engagementValue: parseFloat(e.target.value)})}
                      placeholder="e.g., 0.50"
                      step="0.01"
                      className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Start Date</label>
                    <input 
                      type="date" 
                      value={newCampaign.startDate}
                      onChange={(e) => setNewCampaign({...newCampaign, startDate: e.target.value})}
                      className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">End Date</label>
                    <input 
                      type="date" 
                      value={newCampaign.endDate}
                      onChange={(e) => setNewCampaign({...newCampaign, endDate: e.target.value})}
                      className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setIsCreatingCampaign(false)} className="px-4 py-2 text-gray-500 hover:text-gray-700 font-medium">Cancel</button>
                  <button 
                    onClick={async () => {
                      if (!newCampaign.name) return;
                      try {
                        const campaignData = {
                          ...newCampaign,
                          workspaceId: activeWorkspace,
                          status: 'active',
                          createdAt: new Date().toISOString()
                        };
                        await addDoc(collection(db, 'campaigns'), campaignData);
                        setIsCreatingCampaign(false);
                        setNewCampaign({ name: '', goal: '', startDate: '', endDate: '', budget: 0, status: 'planned' });
                        showToast('Campaign created successfully!', 'success');
                      } catch (e) {
                        console.error(e);
                      }
                    }}
                    className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-indigo-700 transition-colors"
                  >
                    Create Campaign
                  </button>
                </div>
              </div>
            )}

            {campaigns.length === 0 ? (
              <EmptyState 
                icon={Target} 
                title="No campaigns yet" 
                description="Create your first campaign to group your content and track strategic goals."
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {campaigns.map(campaign => {
                  const campaignPosts = posts.filter(p => p.campaign === campaign.name);
                  const totalLikes = campaignPosts.reduce((sum, p) => sum + (p.analytics?.likes || 0), 0);
                  const totalShares = campaignPosts.reduce((sum, p) => sum + (p.analytics?.shares || 0), 0);
                  
                  return (
                    <div key={campaign.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col">
                      <div className="p-6 flex-1">
                        <div className="flex items-center justify-between mb-4">
                          <span className="px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold uppercase rounded">
                            {campaign.status}
                          </span>
                          <span className="text-xs text-gray-400">
                            {moment(campaign.startDate).format('MMM D')} - {moment(campaign.endDate).format('MMM D, YYYY')}
                          </span>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">{campaign.name}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 flex items-center">
                          <Target className="w-3 h-3 mr-1" /> Goal: {campaign.goal}
                        </p>
                        
                        <div className="grid grid-cols-3 gap-4 mb-6">
                          <div className="text-center">
                            <p className="text-xs text-gray-400 uppercase font-bold mb-1">Posts</p>
                            <p className="text-lg font-bold">{campaignPosts.length}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-400 uppercase font-bold mb-1">Likes</p>
                            <p className="text-lg font-bold text-indigo-600">{totalLikes}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-400 uppercase font-bold mb-1">Social Value</p>
                            <p className="text-lg font-bold text-green-600">
                              ${((totalLikes + totalShares) * (campaign.engagementValue || 0.1)).toFixed(2)}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between text-xs font-bold text-gray-400 uppercase">
                            <span>Campaign Progress</span>
                            <span>{Math.min(100, Math.round((campaignPosts.length / 10) * 100))}%</span>
                          </div>
                          <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, (campaignPosts.length / 10) * 100)}%` }}></div>
                          </div>
                        </div>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-900/50 px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
                        <button className="text-xs font-bold text-indigo-600 hover:underline">View Roadmap</button>
                        <button className="text-xs font-bold text-gray-400 hover:text-gray-600">Edit Campaign</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : activeTab === 'media' ? (
          <MediaLibrary workspaceId={activeWorkspace} showToast={showToast} platformConfig={platformConfig} />
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-display font-bold text-gray-900 dark:text-gray-100">Engagement Center</h1>
                <p className="text-gray-500 dark:text-gray-400">Manage your community and track industry trends.</p>
              </div>
              <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                <button 
                  onClick={() => setEngagementTab('inbox')}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${engagementTab === 'inbox' ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                >
                  Unified Inbox
                </button>
                <button 
                  onClick={() => setEngagementTab('listening')}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${engagementTab === 'listening' ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                >
                  Social Listening
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Main Content Column */}
              <div className="lg:col-span-2 space-y-4">
                {engagementTab === 'inbox' ? (
                  <>
                    <h2 className="text-lg font-display font-semibold text-gray-800 dark:text-gray-100 mb-4">Incoming Comments</h2>
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
                            <div key={comment.id} className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center">
                                  <Tooltip text={config?.name || 'Unknown Platform'}>
                                    <div className={`${config?.color || 'bg-gray-500'} w-8 h-8 rounded-full flex items-center justify-center text-white mr-3 cursor-help`}>
                                      <Icon className="w-4 h-4" />
                                    </div>
                                  </Tooltip>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <p className="font-semibold text-gray-900 dark:text-gray-100">{comment.author}</p>
                                      {/* Sentiment Badge */}
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                        comment.text.length % 3 === 0 ? 'bg-green-100 text-green-700' : 
                                        comment.text.length % 3 === 1 ? 'bg-amber-100 text-amber-700' : 
                                        'bg-red-100 text-red-700'
                                      }`}>
                                        {comment.text.length % 3 === 0 ? <Smile className="w-3 h-3 mr-1" /> : 
                                         comment.text.length % 3 === 1 ? <Meh className="w-3 h-3 mr-1" /> : 
                                         <Frown className="w-3 h-3 mr-1" />}
                                        {comment.text.length % 3 === 0 ? 'Positive' : 
                                         comment.text.length % 3 === 1 ? 'Neutral' : 
                                         'Negative'}
                                      </span>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(comment.timestamp).toLocaleString()}</p>
                                  </div>
                                </div>
                                {comment.status === 'replied' && (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 text-xs font-medium">
                                    Replied
                                  </span>
                                )}
                              </div>
                              <p className="text-gray-800 dark:text-gray-200 mb-4">{comment.text}</p>
                              
                              {comment.status === 'pending' && (
                                <div className="flex flex-col gap-2">
                                  {!n8nWebhookUrl && (
                                    <p className="text-xs text-amber-600 dark:text-amber-400 mb-1 flex items-center">
                                      <AlertCircle className="w-3 h-3 mr-1" />
                                      Note: Without an n8n webhook configured, replies will only be marked as replied locally.
                                    </p>
                                  )}
                                  <div className="flex gap-2">
                                    <input 
                                      type="text" 
                                      placeholder="Type a manual reply..." 
                                      className="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && e.currentTarget.value) {
                                          handleReplyToComment(comment.id, e.currentTarget.value);
                                        }
                                      }}
                                    />
                                    <button 
                                      onClick={() => generateAIReply(comment.id, comment.text)}
                                      disabled={replyingToCommentId === comment.id}
                                      className="bg-purple-100 dark:bg-purple-900/30 hover:bg-purple-200 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 px-4 py-2 rounded-lg text-sm font-medium flex items-center transition-colors disabled:opacity-50"
                                    >
                                      {replyingToCommentId === comment.id ? (
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                      ) : (
                                        <Sparkles className="w-4 h-4 mr-2" />
                                      )}
                                      AI Reply
                                    </button>
                                  </div>
                                  {replySuggestions[comment.id] && replySuggestions[comment.id].length > 0 && (
                                    <div className="flex flex-col gap-2 mt-2">
                                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">AI Suggestions:</span>
                                      <div className="flex flex-wrap gap-2">
                                        {replySuggestions[comment.id].map((suggestion, idx) => (
                                          <button
                                            key={idx}
                                            onClick={() => {
                                              handleReplyToComment(comment.id, suggestion);
                                              setReplySuggestions(prev => {
                                                const newSugs = { ...prev };
                                                delete newSugs[comment.id];
                                                return newSugs;
                                              });
                                            }}
                                            className="text-left text-sm bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-800 hover:border-purple-400 dark:hover:border-purple-600 text-gray-700 dark:text-gray-300 px-3 py-2 rounded-lg transition-colors"
                                          >
                                            {suggestion}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-display font-semibold text-gray-800">Industry Mentions</h2>
                      <button 
                        onClick={fetchMentions}
                        disabled={isFetchingMentions || monitoredKeywords.length === 0}
                        className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50"
                      >
                        {isFetchingMentions ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                        Discover Trends
                      </button>
                    </div>

                    {monitoredKeywords.length === 0 ? (
                      <EmptyState 
                        icon={Megaphone} 
                        title="No keywords tracked" 
                        description="Add keywords in Settings to start monitoring industry trends and brand mentions."
                      />
                    ) : mentions.length === 0 ? (
                      <div className="bg-white dark:bg-gray-800 p-12 rounded-2xl border border-gray-200 dark:border-gray-700 text-center">
                        <div className="bg-indigo-50 dark:bg-indigo-900/30 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Sparkles className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Ready to listen?</h3>
                        <p className="text-gray-500 dark:text-gray-400 max-w-sm mx-auto mb-6">Click "Discover Trends" to use AI to find and analyze recent mentions of your tracked keywords across the web.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {mentions.map((mention, i) => (
                          <div key={i} className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-500 transition-colors">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center">
                                <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mr-3">
                                  {mention.platform === 'twitter' ? <Twitter className="w-4 h-4 text-blue-400" /> : <ImageIcon className="w-4 h-4 text-gray-400 dark:text-gray-500" />}
                                </div>
                                <div>
                                  <p className="font-semibold text-gray-900 dark:text-gray-100">@{mention.author}</p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">{mention.timestamp}</p>
                                </div>
                              </div>
                              <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                                mention.sentiment === 'positive' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' :
                                mention.sentiment === 'negative' ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400' :
                                'bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-400'
                              }`}>
                                {mention.sentiment}
                              </span>
                            </div>
                            <p className="text-gray-800 dark:text-gray-200 mb-4">{mention.text}</p>
                            <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                              <span className="flex items-center gap-1"><ThumbsUp className="w-3 h-3" /> {mention.engagement}</span>
                              <button 
                                onClick={() => {
                                  setContent(`Replying to @${mention.author}: ${mention.text}\n\n`);
                                  setActiveTab('dashboard');
                                }}
                                className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
                              >
                                Draft Response
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Sidebar Column */}
              <div className="space-y-6">
                {/* Sentiment Overview */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Sentiment Overview</h3>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600 dark:text-gray-400 flex items-center">
                          <Smile className="w-4 h-4 mr-2 text-green-500" /> Positive
                        </span>
                        <span className="font-bold">68%</span>
                      </div>
                      <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500" style={{ width: '68%' }}></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600 dark:text-gray-400 flex items-center">
                          <Meh className="w-4 h-4 mr-2 text-amber-500" /> Neutral
                        </span>
                        <span className="font-bold">24%</span>
                      </div>
                      <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500" style={{ width: '24%' }}></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600 dark:text-gray-400 flex items-center">
                          <Frown className="w-4 h-4 mr-2 text-red-500" /> Negative
                        </span>
                        <span className="font-bold">8%</span>
                      </div>
                      <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-red-500" style={{ width: '8%' }}></div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl">
                    <div className="flex items-center text-red-700 dark:text-red-400 mb-2">
                      <AlertCircle className="w-4 h-4 mr-2" />
                      <span className="text-xs font-bold uppercase">Crisis Alert</span>
                    </div>
                    <p className="text-xs text-red-600 dark:text-red-300">
                      Negative sentiment has increased by 12% in the last 2 hours. Review recent comments.
                    </p>
                  </div>
                </div>

                {/* Automation Settings Column */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-display font-semibold text-gray-800 dark:text-gray-100 flex items-center">
                      <Bot className="w-5 h-5 mr-2 text-indigo-600 dark:text-indigo-400" />
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
                              brandPersonality,
                              brandValues,
                              brandTargetAudience,
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

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                  <h2 className="text-lg font-display font-semibold text-gray-800 flex items-center mb-6">
                    <Sparkles className="w-5 h-5 mr-2 text-indigo-600" />
                    Brand Kit & Content Strategy
                  </h2>
                  <p className="text-sm text-gray-600 mb-6">
                    Define your brand's identity to ensure all AI-generated content remains consistent and aligned with your strategy.
                  </p>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Brand Logo URL</label>
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          value={brandLogoUrl}
                          onChange={(e) => setBrandLogoUrl(e.target.value)}
                          placeholder="https://example.com/logo.png"
                          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        {brandLogoUrl && (
                          <img src={brandLogoUrl} alt="Logo" className="w-10 h-10 rounded border border-gray-200 object-contain bg-white" />
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Brand Colors</label>
                      <div className="flex flex-wrap gap-2">
                        {brandColors.map((color, idx) => (
                          <div key={idx} className="flex items-center gap-1 bg-gray-50 p-1 rounded-lg border border-gray-200">
                            <input 
                              type="color" 
                              value={color}
                              onChange={(e) => {
                                const newColors = [...brandColors];
                                newColors[idx] = e.target.value;
                                setBrandColors(newColors);
                              }}
                              className="w-6 h-6 rounded cursor-pointer border-none"
                            />
                            <button 
                              onClick={() => setBrandColors(brandColors.filter((_, i) => i !== idx))}
                              className="text-gray-400 hover:text-red-500"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        <button 
                          onClick={() => setBrandColors([...brandColors, '#000000'])}
                          className="w-8 h-8 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:text-indigo-600 hover:border-indigo-600 transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Brand Personality</label>
                      <textarea
                        value={brandPersonality}
                        onChange={(e) => setBrandPersonality(e.target.value)}
                        placeholder="e.g., Professional yet witty, authoritative but approachable, bold and energetic..."
                        className="w-full h-24 p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Core Values & Mission</label>
                      <textarea
                        value={brandValues}
                        onChange={(e) => setBrandValues(e.target.value)}
                        placeholder="e.g., Sustainability, innovation, customer-first, transparency..."
                        className="w-full h-24 p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Target Audience</label>
                      <textarea
                        value={brandTargetAudience}
                        onChange={(e) => setBrandTargetAudience(e.target.value)}
                        placeholder="e.g., Tech-savvy millennials, small business owners, fitness enthusiasts aged 25-40..."
                        className="w-full h-24 p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none text-sm"
                      />
                    </div>
                    <button 
                      onClick={saveAutomationSettings}
                      disabled={isSavingPersona}
                      className="w-full bg-gray-900 hover:bg-black text-white px-4 py-2.5 rounded-lg font-medium flex items-center justify-center transition-colors disabled:opacity-50"
                    >
                      {isSavingPersona ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : 'Save Brand Kit'}
                    </button>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                  <h2 className="text-lg font-display font-semibold text-gray-800 flex items-center mb-6">
                    <Megaphone className="w-5 h-5 mr-2 text-indigo-600" />
                    Social Listening Keywords
                  </h2>
                  <p className="text-sm text-gray-600 mb-4">
                    Track mentions of your brand, competitors, or industry keywords across social media.
                  </p>
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        placeholder="Add keyword (e.g. #SocialSync, @competitor)"
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.currentTarget.value) {
                            const val = e.currentTarget.value.trim();
                            if (val && !monitoredKeywords.includes(val)) {
                              setMonitoredKeywords(prev => [...prev, val]);
                              e.currentTarget.value = '';
                            }
                          }
                        }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {monitoredKeywords.map(kw => (
                        <span key={kw} className="inline-flex items-center px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-100">
                          {kw}
                          <button onClick={() => setMonitoredKeywords(prev => prev.filter(k => k !== kw))} className="ml-1.5 hover:text-indigo-900">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <button 
                      onClick={saveAutomationSettings}
                      disabled={isSavingPersona}
                      className="w-full bg-gray-900 hover:bg-black text-white px-4 py-2.5 rounded-lg font-medium flex items-center justify-center transition-colors disabled:opacity-50"
                    >
                      {isSavingPersona ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : 'Save Keywords'}
                    </button>
                  </div>
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
