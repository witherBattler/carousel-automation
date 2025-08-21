/** Simple React client-facing dashboard
 *  This file implements a small authentication gate and a client UI that
 *  allows starting the carousel generator either from notes or from a URL.
 *  It removes editor access and n4n-specific branding.
 */
 
const { useState, useEffect, useCallback } = React;
 
function DashboardApp() {
  const [status, setStatus] = useState('idle');
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('dashboardToken') || null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('notes'); // 'notes' or 'url'
  const [notes, setNotes] = useState('');
  const [url, setUrl] = useState('');
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState(null);
  const [runSaveId, setRunSaveId] = useState(null);
  const [runFiles, setRunFiles] = useState([]);
  const [user, setUser] = useState(null);
  const [igConnecting, setIgConnecting] = useState(false);
  const [loadingOutputs, setLoadingOutputs] = useState(false);
  const [igPublishing, setIgPublishing] = useState(false);
  const [igCaption, setIgCaption] = useState('');
  const [igLimits, setIgLimits] = useState(null);
  const [generatedCaption, setGeneratedCaption] = useState('');
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isEditingCaption, setIsEditingCaption] = useState(false);

  // Keyboard navigation for carousel
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (runFiles.length <= 1) return;
      
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentSlide(prev => prev === 0 ? runFiles.length - 1 : prev - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentSlide(prev => prev === runFiles.length - 1 ? 0 : prev + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [runFiles.length]);

  useEffect(() => {
    refreshUserInfo()
  }, [igConnecting])

  // Fetch Instagram limits when user connects
  useEffect(() => {
    if (user?.instagram_connected) {
      fetchIgLimits();
    } else {
      setIgLimits(null);
    }
  }, [user?.instagram_connected, authToken]);

  // Function to refresh user info that can be called from anywhere
  const refreshUserInfo = useCallback(async () => {
    const token = localStorage.getItem('dashboardToken');
    if (token) {
      try {
        console.log('Refreshing user info...');
        const res = await fetch('/api/dashboard/user', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'x-dashboard-token': token
          }
        });
        const data = await res.json();
        console.log('User info refresh result:', data);
        if (data.ok) {
          setUser(data.user);
          return data.user;
        }
      } catch (e) {
        console.error('Failed to refresh user info:', e);
      }
    }
    return null;
  }, []); // No dependencies needed since we're using localStorage

  async function fetchRunOutputs(saveId, { retries = 3, delayMs = 1000 } = {}) {
    setLoadingOutputs(true);
    try {
      console.log(`🔍 Fetching outputs for run ${saveId} (${retries} retries left)`);
      const res = await fetch(`/api/client/outputs/${encodeURIComponent(saveId)}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'x-dashboard-token': authToken
        }
      });
      const data = await res.json();
      if (res.status === 401 || (data && typeof data.error === 'string' && (/Invalid token/i.test(data.error) || /Token expired/i.test(data.error)))) {
        logout();
        setMessage('Your session has expired. Please sign in again.');
        setLoadingOutputs(false);
        return;
      }
      if (data && data.ok && Array.isArray(data.files)) {
        console.log(`📸 Found ${data.files.length} generated images`);
        setRunFiles(data.files);
        
        // If we have fewer than expected images and retries left, wait and try again
        if (data.files.length === 0 && retries > 0) {
          console.log(`⏳ No images found yet, waiting ${delayMs}ms before retry...`);
          await new Promise(r => setTimeout(r, delayMs));
          return fetchRunOutputs(saveId, { retries: retries - 1, delayMs: delayMs * 1.5 }); // Increase delay each retry
        }
        
        // If we have some images but expect more (typical carousel has 5-10 slides), retry once more
        if (data.files.length > 0 && data.files.length < 5 && retries > 0) {
          console.log(`🖼️ Found ${data.files.length} images, checking for more in ${delayMs}ms...`);
          await new Promise(r => setTimeout(r, delayMs));
          return fetchRunOutputs(saveId, { retries: retries - 1, delayMs: delayMs * 1.5 });
        }
        
        setLoadingOutputs(false);
      }
    } catch (e) {
      console.error('Error fetching run outputs:', e);
      if (retries > 0) {
        await new Promise(r => setTimeout(r, delayMs));
        return fetchRunOutputs(saveId, { retries: retries - 1, delayMs });
      } else {
        setLoadingOutputs(false);
      }
    }
  }
 
  useEffect(() => {
    async function loadInfo() {
      try {
        const res = await fetch('/api/status').then(r => r.json()).catch(() => null);
        if (res && res.ok) {
          setStatus('ready');
        } else {
          setStatus('ready');
        }
      } catch (e) {
        setStatus('error');
      }
    }
    loadInfo();
  }, []);

  useEffect(() => {
    async function loadUserInfo() {
      if (!authToken) return;
      try {
        const res = await fetch('/api/dashboard/user', {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'x-dashboard-token': authToken
          }
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          setUser(data.user);
        }
      } catch (e) {
        console.error('Failed to load user info:', e);
      }
    }
    loadUserInfo();
  }, [authToken]);

  // Separate effect for URL parameter handling
  useEffect(() => {
    // Check for Instagram OAuth callback parameters (fallback for direct navigation)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('ig_connected') === 'true') {
      setMessage('✅ Instagram account connected successfully!');
      // Reload user info to get updated Instagram status
      if (authToken) {
        fetch('/api/dashboard/user', {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'x-dashboard-token': authToken
          }
        }).then(res => res.json()).then(data => {
          if (data.ok) setUser(data.user);
        });
      }
      // Clean up URL
      window.history.replaceState({}, document.title, '/');
    } else if (urlParams.get('ig_error') === 'true') {
      setMessage('❌ Failed to connect Instagram account. Please try again.');
      window.history.replaceState({}, document.title, '/');
    }
  }, [authToken]);

  // Set up message listener for Instagram OAuth popup
  useEffect(() => {
    // Listen for messages from Instagram OAuth popup
    function handleMessage(event) {
      console.log('📨 Received message from popup:', event.data, 'from origin:', event.origin);
      
      // Only accept messages from our own domain for security (but be more flexible)
      const currentOrigin = window.location.origin;
      if (event.origin !== currentOrigin && event.origin !== 'null') {
        console.log('🚫 Ignoring message from different origin:', event.origin, 'expected:', currentOrigin);
        return;
      }
      
      if (event.data && event.data.type === 'INSTAGRAM_OAUTH_SUCCESS') {
        console.log('✅ Instagram OAuth success received!');
        setMessage('✅ Instagram account connected successfully!');
        setIgConnecting(false);
        
        // Add a small delay to give the server time to update the session
        console.log('🔄 Waiting 500ms before refreshing user info...');
        setTimeout(() => {
          console.log('🔄 Now refreshing user info after OAuth success...');
          refreshUserInfo().then(updatedUser => {
            if (updatedUser && updatedUser.instagram_connected) {
              console.log('✨ User info updated successfully:', updatedUser);
            } else {
              console.error('❌ Failed to update user info or Instagram not connected');
              // Try again after another delay
              setTimeout(() => {
                console.log('🔄 Retrying user info refresh...');
                refreshUserInfo();
              }, 1000);
            }
          });
        }, 500);
        
      } else if (event.data && event.data.type === 'INSTAGRAM_OAUTH_ERROR') {
        console.log('❌ Instagram OAuth error received');
        setMessage('❌ Failed to connect Instagram account. Please try again.');
        setIgConnecting(false);
      }
    }

    console.log('🎧 Setting up Instagram OAuth message listener...');
    window.addEventListener('message', handleMessage);
    
    // Cleanup event listener
    return () => {
      console.log('🧹 Cleaning up Instagram OAuth message listener...');
      window.removeEventListener('message', handleMessage);
    };
  }, [refreshUserInfo]); // Include refreshUserInfo in dependencies
 
  async function login(e) {
    e && e.preventDefault && e.preventDefault();
    setMessage(null);
    try {
      const res = await fetch('/api/dashboard-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok && data.ok && data.token) {
        localStorage.setItem('dashboardToken', data.token);
        setAuthToken(data.token);
        setMessage('Logged in');
      } else {
        setMessage(data && data.error ? data.error : 'Login failed');
      }
    } catch (err) {
      setMessage('Login failed');
    }
  }
 
  function logout() {
    localStorage.removeItem('dashboardToken');
    setAuthToken(null);
    setUser(null);
    setUsername('');
    setPassword('');
    setMessage('Logged out');
  }

  async function connectInstagram() {
    if (!authToken) return;
    setIgConnecting(true);
    setMessage(null); // Clear any existing messages
    
    try {
      const res = await fetch('/api/instagram/auth', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'x-dashboard-token': authToken
        }
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        console.log('🔗 Opening Instagram OAuth popup...');
        console.log('🔑 Auth token:', authToken.substring(0, 8) + '...');
        
        // Open Instagram OAuth in a new window with state parameter containing the token
        const authUrlWithState = `${data.authUrl}&state=${encodeURIComponent(authToken)}`;
        console.log('🔗 Full OAuth URL:', authUrlWithState);
        
        const popup = window.open(
          authUrlWithState, 
          'instagram_oauth', 
          'width=600,height=700,scrollbars=yes,resizable=yes,location=yes,status=yes'
        );
        
        if (!popup) {
          setMessage('❌ Popup blocked! Please allow popups for this site and try again.');
          setIgConnecting(false);
          return;
        }
        
        console.log('Popup opened successfully');
        
        // Monitor popup for closure (in case user closes it manually)
        const checkClosed = setInterval(() => {
          if (popup && popup.closed) {
            console.log('Popup was closed manually');
            clearInterval(checkClosed);
            setIgConnecting(false);
          }
        }, 1000);
        
        // Clear interval after 5 minutes (timeout)
        setTimeout(() => {
          console.log('OAuth timeout reached');
          clearInterval(checkClosed);
          if (popup && !popup.closed) {
            popup.close();
          }
          if (igConnecting) {
            setMessage('❌ Instagram connection timed out. Please try again.');
            setIgConnecting(false);
          }
        }, 300000); // 5 minutes
        
      } else {
        setMessage('❌ Failed to initiate Instagram connection');
        setIgConnecting(false);
      }
    } catch (e) {
      console.error('Error connecting to Instagram:', e);
      setMessage('❌ Error connecting to Instagram');
      setIgConnecting(false);
    }
  }
 
  async function runClientWorkflow(e) {
    e && e.preventDefault && e.preventDefault();
    setMessage(null);
    setRunSaveId(null);
    setRunFiles([]);
    setGeneratedCaption('');
    setCurrentSlide(0);
    setIsEditingCaption(false);
    if (!authToken) {
      setMessage('Not authenticated');
      return;
    }
    if (mode === 'notes' && !notes.trim()) {
      setMessage('Please provide notes to continue.');
      return;
    }
    if (mode === 'url' && !url.trim()) {
      setMessage('Please provide a URL to continue.');
      return;
    }
    setRunning(true);
    try {
      const payload = mode === 'notes' ? { mode: 'notes', notes } : { mode: 'url', url };
      const res = await fetch('/api/client/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          // Send token in both headers to avoid proxy/casing issues
          'x-dashboard-token': authToken
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.status === 401 || (data && typeof data.error === 'string' && (/Invalid token/i.test(data.error) || /Token expired/i.test(data.error)))) {
        // Token is invalid/expired or server restarted (sessions are in-memory)
        logout();
        setMessage('Your session has expired. Please sign in again.');
        return;
      }
      if (res.ok && data.ok) {
        // Server executes synchronously for dashboard run and returns saveId/files
        if (data.saveId) setRunSaveId(data.saveId);
        if (Array.isArray(data.files)) setRunFiles(data.files);
        if (data.caption) {
          console.log('📝 Received caption:', data.caption);
          setGeneratedCaption(data.caption);
          setIgCaption(data.caption); // Pre-fill the caption input
        } else {
          console.log('❌ No caption received in response');
        }
        
        // Add 5-second delay before fetching outputs to ensure all images are fully generated
        if (data.saveId) {
          console.log('🎨 Workflow completed! Waiting 5 seconds for all images to be generated...');
          setMessage(`Success — generated outputs for run ${data.saveId}. Loading images...`);
          
          setTimeout(() => {
            console.log('🔄 Now fetching generated outputs...');
            fetchRunOutputs(data.saveId);
            setMessage(`Success — generated outputs for run ${data.saveId}.`);
          }, 5000); // 5-second delay
        } else {
          setMessage('Success — job completed.');
        }
      } else {
        setMessage(data && data.error ? data.error : 'Failed to start job');
      }
    } catch (err) {
      setMessage('Failed to start job');
    } finally {
      setRunning(false);
    }
  }

  function refreshOutputs() {
    if (runSaveId) {
      console.log('🔄 Manual refresh of outputs requested');
      fetchRunOutputs(runSaveId, { retries: 5, delayMs: 1000 });
    }
  }

  async function copyOutputsLink() {
    if (!runSaveId || !navigator.clipboard) return;
    const url = `${location.origin}/outputs/${runSaveId}/`;
    try {
      await navigator.clipboard.writeText(url);
      setMessage('Link copied to clipboard');
      setTimeout(() => setMessage(null), 2000);
    } catch {}
  }

  // Fetch Instagram publishing limits
  const fetchIgLimits = async () => {
    if (!authToken || !user?.instagram_connected) return;
    try {
      const res = await fetch('/api/instagram/limits', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'x-dashboard-token': authToken
        }
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setIgLimits(data);
      }
    } catch (e) {
      console.error('Failed to fetch Instagram limits:', e);
    }
  };

  // Publish carousel to Instagram
  const publishToInstagram = async () => {
    if (!runSaveId || !user?.instagram_connected) return;
    
    setIgPublishing(true);
    try {
      console.log('📱 Publishing carousel to Instagram...');
      const res = await fetch('/api/instagram/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'x-dashboard-token': authToken
        },
        body: JSON.stringify({
          saveId: runSaveId,
          caption: igCaption.trim()
        })
      });
      
      const data = await res.json();
      if (res.ok && data.ok) {
        setMessage(`🎉 ${data.message}`);
        setIgCaption(''); // Clear caption after successful post
        // Update limits
        if (data.remainingPosts !== undefined) {
          setIgLimits(prev => prev ? { ...prev, remainingPosts: data.remainingPosts } : null);
        }
      } else {
        setMessage(`❌ ${data.error || 'Failed to publish to Instagram'}`);
      }
    } catch (e) {
      console.error('Error publishing to Instagram:', e);
      setMessage('❌ Error publishing to Instagram. Please try again.');
    } finally {
      setIgPublishing(false);
    }
  };
 
  // If not authenticated, show login screen
  if (!authToken) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-100 flex items-center justify-center p-6 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-20 left-20 w-72 h-72 bg-gradient-to-r from-purple-300 to-pink-300 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
          <div className="absolute top-40 right-20 w-72 h-72 bg-gradient-to-r from-yellow-300 to-red-300 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
          <div className="absolute -bottom-8 left-40 w-72 h-72 bg-gradient-to-r from-blue-300 to-green-300 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
        </div>
        
        <div className="w-full max-w-md relative z-10">
          {/* Welcome section */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg mb-4">
              <i className="fa-solid fa-images text-white text-xl"></i>
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent mb-2">Welcome Back</h1>
            <p className="text-gray-600">Sign in to access your carousel generator</p>
          </div>
          
          <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 overflow-hidden">
            <div className="px-8 py-6 border-b border-gray-100/50">
              <div className="flex items-center space-x-3">
                <img src="/logo.png" className="w-10 h-10 rounded-xl shadow-sm" alt="Logo" />
                <div>
                  <h2 className="text-xl font-semibold text-gray-900" style={{marginBottom: "-3px"}}>Carousel Generator</h2>
                  <p className="text-sm text-gray-500">Create stunning Instagram content</p>
                </div>
              </div>
            </div>
            
            <form onSubmit={login} className="px-8 py-6 space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2 font-mono">Username</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <i className="fa-solid fa-user text-gray-400"></i>
                    </div>
                    <input 
                      value={username} 
                      onChange={e => setUsername(e.target.value)} 
                      className="block w-full pl-10 pr-3 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-gray-50/50 hover:bg-white focus:bg-white font-mono" 
                      placeholder="Enter your username" 
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2 font-mono">Password</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <i className="fa-solid fa-lock text-gray-400"></i>
                    </div>
                    <input 
                      type="password" 
                      value={password} 
                      onChange={e => setPassword(e.target.value)} 
                      className="block w-full pl-10 pr-3 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-gray-50/50 hover:bg-white focus:bg-white font-mono" 
                      placeholder="Enter your password" 
                    />
                  </div>
                </div>
              </div>
              
              <button 
                type="submit" 
                className="w-full inline-flex items-center justify-center px-6 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl font-mono"
              >
                <i className="fa-solid fa-right-to-bracket mr-2" /> 
                Sign In
              </button>
              
              {message && (
                <div className="flex items-center space-x-2 p-3 rounded-lg bg-red-50 border border-red-200">
                  <i className="fa-solid fa-exclamation-triangle text-red-500"></i>
                  <span className="text-sm text-red-700">{message}</span>
                </div>
              )}
            </form>
          </div>
          
          <p className="text-center text-sm text-gray-500 mt-6 opacity-75">Use the credentials provided to access your account</p>
        </div>
      </div>
    );
  }
 
  // Authenticated UI: modern dashboard with enhanced styling
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Background decoration */}
      <div className="fixed inset-0 opacity-20 pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-l from-purple-200 to-pink-200 rounded-full mix-blend-multiply filter blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-r from-blue-200 to-cyan-200 rounded-full mix-blend-multiply filter blur-3xl"></div>
      </div>
      
      <header className="sticky top-0 z-20 border-b border-white/20 bg-white/80 backdrop-blur-xl shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                <img src="/logo.png" className="w-6 h-6 rounded-lg" alt="Logo" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent font-mono">Carousel Generator</h1>
                <p className="text-sm text-gray-500 font-mono">Create stunning Instagram carousels</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${status === 'ready' ? 'bg-green-400' : status === 'error' ? 'bg-red-400' : 'bg-gray-400'} animate-pulse`}></div>
              <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold font-mono ${status === 'ready' ? 'bg-green-100 text-green-700 border border-green-200' : status === 'error' ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-gray-100 text-gray-700 border border-gray-200'}`}>
                {status === 'idle' ? 'Idle' : status === 'ready' ? 'Ready' : 'Error'}
              </span>
            </div>

            {/* Instagram Connection Status */}
            {user && (
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${user.instagram_connected ? 'bg-purple-400' : 'bg-gray-300'} ${user.instagram_connected ? 'animate-pulse' : ''}`}></div>
                <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold font-mono ${user.instagram_connected ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
                  <i className={`fa-brands fa-instagram mr-1.5 ${user.instagram_connected ? 'text-purple-600' : 'text-gray-400'}`}></i>
                  {user.instagram_connected ? 'Connected' : 'Not Connected'}
                </span>
                {/* Debug refresh button */}
                <button 
                  onClick={async () => {
                    console.log('📱 Manual refresh clicked');
                    const updatedUser = await refreshUserInfo();
                    if (updatedUser) {
                      setMessage('✨ User info refreshed');
                    }
                  }}
                  className="inline-flex items-center px-2 py-1 rounded-lg border border-gray-200 text-xs hover:bg-gray-50 font-mono"
                  title="Refresh user info"
                >
                  <i className="fa-solid fa-refresh"></i>
                </button>
              </div>
            )}
            
            <button 
              onClick={logout} 
              className="inline-flex items-center px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-all duration-200 bg-white/50 backdrop-blur-sm hover:shadow-md font-mono"
            >
              <i className="fa-solid fa-right-from-bracket mr-2 text-gray-500" /> 
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {message && (
          <div className="mb-8 animate-in slide-in-from-top duration-300">
            <div className="flex items-center justify-between rounded-2xl border border-white/30 bg-white/80 backdrop-blur-xl px-5 py-4 shadow-lg">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                  <i className="fa-solid fa-circle-info text-white text-sm" />
                </div>
                <span className="text-sm font-medium text-gray-700 font-mono">{message}</span>
              </div>
              <button 
                className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors font-mono" 
                onClick={() => setMessage(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Instagram Connection Card */}
        {user && !user.instagram_connected && (
          <div className="mb-8 animate-in slide-in-from-top duration-300">
            <div className="bg-gradient-to-r from-purple-500 to-pink-600 rounded-3xl border border-white/30 shadow-xl overflow-hidden">
              <div className="px-6 sm:px-8 py-6 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                      <i className="fa-brands fa-instagram text-white text-xl"></i>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold font-mono">Connect Instagram</h3>
                      <p className="text-sm opacity-90 font-mono">Enable automatic posting to your Instagram Business account</p>
                    </div>
                  </div>
                  <button
                    onClick={connectInstagram}
                    disabled={igConnecting}
                    className={`inline-flex items-center px-6 py-3 rounded-2xl font-bold transition-all duration-200 transform font-mono ${
                      igConnecting 
                        ? 'bg-white/20 cursor-not-allowed' 
                        : 'bg-white text-purple-600 hover:bg-gray-50 hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl'
                    }`}
                  >
                    {igConnecting && (
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                      </svg>
                    )}
                    <i className={`fa-solid fa-link ${igConnecting ? '' : 'mr-2'}`}></i>
                    {igConnecting ? 'Connecting...' : 'Connect Now'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8">
          <section className="xl:col-span-2 bg-white/80 backdrop-blur-xl rounded-3xl border border-white/30 shadow-xl overflow-hidden">
            <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 border-b border-gray-100/50 bg-gradient-to-r from-gray-50/50 to-white/50">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center font-mono">
                    <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center mr-3">
                      <i className="fa-solid fa-play text-white text-sm"></i>
                    </div>
                    Start New Generation
                  </h2>
                  <p className="text-sm text-gray-600 mt-1 font-mono">Transform your content into stunning Instagram carousels</p>
                </div>
                {runSaveId && (
                  <div className="flex items-center space-x-2 bg-gray-100 rounded-lg px-3 py-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                    <span className="text-xs text-gray-600 font-mono">Last run: <span className="font-semibold text-gray-800">{runSaveId}</span></span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
              <div className="inline-flex rounded-2xl border border-gray-200 overflow-hidden bg-gray-50 p-1">
                <button 
                  onClick={() => setMode('notes')} 
                  className={`px-4 sm:px-6 py-2 sm:py-3 text-sm font-semibold rounded-xl transition-all duration-200 font-mono ${mode === 'notes' ? 'bg-white text-indigo-700 shadow-md transform scale-105' : 'text-gray-600 hover:text-gray-800'}`}
                >
                  <i className="fa-solid fa-note-sticky mr-2"></i>
                  Notes
                </button>
                <button 
                  onClick={() => setMode('url')} 
                  className={`px-4 sm:px-6 py-2 sm:py-3 text-sm font-semibold rounded-xl transition-all duration-200 font-mono ${mode === 'url' ? 'bg-white text-indigo-700 shadow-md transform scale-105' : 'text-gray-600 hover:text-gray-800'}`}
                >
                  <i className="fa-solid fa-link mr-2"></i>
                  URL
                </button>
              </div>

              <form onSubmit={runClientWorkflow} className="space-y-6">
                <div className="relative">
                  {mode === 'notes' && (
                    <div className="space-y-3">
                      <label className="flex items-center text-sm font-bold text-gray-700 font-mono">
                        <i className="fa-solid fa-pencil mr-2 text-indigo-500"></i>
                        Your Content Notes
                      </label>
                      <div className="relative">
                        <textarea 
                          value={notes} 
                          onChange={e => setNotes(e.target.value)} 
                          rows={10} 
                          className="block w-full px-4 py-4 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-gray-50/50 hover:bg-white focus:bg-white resize-none font-mono" 
                          placeholder="Paste your article, blog post, or any content you'd like to transform into a carousel. The AI will analyze your text and create engaging slides automatically."
                        />
                        <div className="absolute bottom-3 right-3 text-xs text-gray-400 font-mono">
                          {notes.length} characters
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {mode === 'url' && (
                    <div className="space-y-3">
                      <label className="flex items-center text-sm font-bold text-gray-700 font-mono">
                        <i className="fa-solid fa-globe mr-2 text-indigo-500"></i>
                        Website URL
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <i className="fa-solid fa-link text-gray-400"></i>
                        </div>
                        <input 
                          value={url} 
                          onChange={e => setUrl(e.target.value)} 
                          className="block w-full pl-12 pr-4 py-4 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 bg-gray-50/50 hover:bg-white focus:bg-white font-mono" 
                          placeholder="https://example.com/article"
                        />
                      </div>
                      <p className="text-xs text-gray-500 flex items-center font-mono">
                        <i className="fa-solid fa-info-circle mr-1"></i>
                        We'll extract and analyze the content from this URL to create your carousel
                      </p>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-4 pt-4">
                  <button 
                    type="submit" 
                    disabled={running} 
                    className={`inline-flex items-center px-6 sm:px-8 py-3 sm:py-4 rounded-2xl font-bold transition-all duration-200 transform ${running ? 'bg-gradient-to-r from-gray-400 to-gray-500 cursor-not-allowed' : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl'} text-white text-sm sm:text-base font-mono`}
                  >
                    {running && (
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                      </svg>
                    )}
                    <i className={`${running ? '' : 'fa-solid fa-magic-wand-sparkles mr-2'}`}></i>
                    {running ? 'Generating Magic...' : 'Generate Carousel'}
                  </button>
                  
                  <button 
                    type="button" 
                    onClick={() => { setNotes(''); setUrl(''); setMessage(null); }} 
                    className="inline-flex items-center px-4 sm:px-6 py-3 sm:py-4 rounded-2xl border-2 border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 text-sm sm:text-base font-mono"
                  >
                    <i className="fa-solid fa-trash mr-2"></i>
                    Clear
                  </button>
                </div>
              </form>
            </div>
          </section>

          <section className="bg-white/80 backdrop-blur-xl rounded-3xl border border-white/30 shadow-xl overflow-hidden">
            <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-100/50 bg-gradient-to-r from-gray-50/50 to-white/50">
              <h2 className="text-base sm:text-lg font-bold text-gray-900 flex items-center mb-2 font-mono">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center mr-3">
                  <i className="fa-solid fa-images text-white text-sm"></i>
                </div>
                Generated Carousel
              </h2>
              
              <div className="flex items-center gap-3">
                <button 
                  onClick={refreshOutputs} 
                  disabled={!runSaveId} 
                  className="inline-flex items-center px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 bg-white/50 font-mono"
                >
                  <i className="fa-solid fa-rotate mr-2" /> 
                  Refresh
                </button>
                
                <button 
                  onClick={copyOutputsLink} 
                  disabled={!runSaveId} 
                  className="inline-flex items-center px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 bg-white/50 font-mono"
                >
                  <i className="fa-solid fa-link mr-2" /> 
                  Copy Link
                </button>
              </div>
            </div>
            
            <div className="px-4 sm:px-6 py-6">
              {!runSaveId ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <i className="fa-solid fa-images text-gray-400 text-xl"></i>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2 font-mono">No Carousel Yet</h3>
                  <p className="text-sm text-gray-500 font-mono">Start a generation to see your carousel images here</p>
                </div>
              ) : runFiles.length === 0 || loadingOutputs ? (
                <div className="space-y-4">
                  <div className="text-center py-8">
                    <div className="animate-spin w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full mx-auto mb-4"></div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2 font-mono">
                      {loadingOutputs ? 'Loading Your Carousel' : 'Generating Your Carousel'}
                    </h3>
                    <p className="text-sm text-gray-500 font-mono">
                      {loadingOutputs ? 'Fetching your generated slides...' : 'Please wait while we create your stunning slides...'}
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="aspect-square rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 animate-pulse flex items-center justify-center">
                        <i className="fa-solid fa-image text-gray-300 text-2xl"></i>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-center py-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1 font-mono">🎉 Carousel Ready!</h3>
                    <p className="text-sm text-gray-500 font-mono">{runFiles.length} slides generated successfully</p>
                    

                          </div>
                  
                  {/* Instagram-Style Carousel Preview */}
                  <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden"
                       style={{maxWidth: '400px'}}>
                    {/* Instagram Header */}
                    <div className="flex items-center justify-between p-4 border-b border-gray-100">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                          <img src="/logo.png" className="w-5 h-5 rounded-full" alt="Logo" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-gray-900">victry_app</div>
                          <div className="text-xs text-gray-500">Sponsored</div>
                        </div>
                      </div>
                      <button className="text-gray-400 hover:text-gray-600">
                        <i className="fa-solid fa-ellipsis text-lg"></i>
                      </button>
                    </div>
                    
                    {/* Carousel Container */}
                    <div className="relative">
                      {/* Main Image */}
                      <div className="bg-black relative overflow-hidden" style={{aspectRatio: '4/5'}}>
                        <img 
                          src={runFiles[currentSlide]} 
                          alt={`Slide ${currentSlide + 1}`} 
                          className="w-full h-full object-cover" 
                        />
                        
                        {/* Navigation Arrows */}
                        {runFiles.length > 1 && (
                          <>
                            <button
                              onClick={() => setCurrentSlide(prev => prev === 0 ? runFiles.length - 1 : prev - 1)}
                              className="absolute left-3 top-1/2 transform -translate-y-1/2 w-8 h-8 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white transition-all duration-200"
                            >
                              <i className="fa-solid fa-chevron-left text-sm"></i>
                            </button>
                            <button
                              onClick={() => setCurrentSlide(prev => prev === runFiles.length - 1 ? 0 : prev + 1)}
                              className="absolute right-3 top-1/2 transform -translate-y-1/2 w-8 h-8 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white transition-all duration-200"
                            >
                              <i className="fa-solid fa-chevron-right text-sm"></i>
                            </button>
                          </>
                        )}
                        
                        {/* Slide Counter */}
                        <div className="absolute top-3 right-3 bg-black/50 rounded-full px-2 py-1">
                          <span className="text-white text-xs font-medium">{currentSlide + 1}/{runFiles.length}</span>
                        </div>
                      </div>
                      
                      {/* Dots Indicator */}
                      {runFiles.length > 1 && (
                        <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 flex space-x-1">
                          {runFiles.map((_, index) => (
                            <button
                              key={index}
                              onClick={() => setCurrentSlide(index)}
                              className={`w-2 h-2 rounded-full transition-all duration-200 ${
                                index === currentSlide 
                                  ? 'bg-white' 
                                  : 'bg-white/50 hover:bg-white/70'
                              }`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    
                    {/* Instagram Actions */}
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-4">
                          <button className="text-gray-700 hover:text-red-500 transition-colors">
                            <i className="fa-regular fa-heart text-xl"></i>
                          </button>
                          <button className="text-gray-700 hover:text-gray-900 transition-colors">
                            <i className="fa-regular fa-comment text-xl"></i>
                          </button>
                          <button className="text-gray-700 hover:text-gray-900 transition-colors">
                            <i className="fa-regular fa-paper-plane text-xl"></i>
                          </button>
                        </div>
                        <button className="text-gray-700 hover:text-gray-900 transition-colors">
                          <i className="fa-regular fa-bookmark text-xl"></i>
                        </button>
                      </div>
                      
                      <div className="text-sm text-gray-900 mb-2">
                        <span className="font-semibold">127 likes</span>
                      </div>
                      
                      {/* Caption */}
                      <div className="text-sm text-gray-900 leading-relaxed">
                        <span className="font-semibold">victry_app</span>{' '}
                        {generatedCaption ? (
                          isEditingCaption ? (
                            <div className="mt-2">
                          <textarea
                            value={igCaption}
                            onChange={e => setIgCaption(e.target.value)}
                                rows={4}
                            maxLength={2200}
                                className="block w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 bg-white text-sm resize-none"
                                placeholder="Write your caption..."
                              />
                              <div className="flex items-center justify-between mt-2">
                                <span className="text-xs text-gray-500">{igCaption.length}/2200</span>
                                <div className="flex space-x-2">
                                  <button
                                    onClick={() => {
                                      setIgCaption(generatedCaption);
                                      setIsEditingCaption(false);
                                    }}
                                    className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded transition-colors"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => setIsEditingCaption(false)}
                                    className="text-xs bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700 transition-colors"
                                  >
                                    Save
                                  </button>
                          </div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between">
                              <span className="whitespace-pre-line flex-1">{igCaption || generatedCaption}</span>
                              <button
                                onClick={() => setIsEditingCaption(true)}
                                className="ml-2 text-gray-400 hover:text-gray-600 transition-colors p-1"
                                title="Edit caption"
                              >
                                <i className="fa-solid fa-pen text-xs"></i>
                              </button>
                            </div>
                          )
                        ) : (
                          <span className="text-gray-500 italic">Caption is being generated...</span>
                        )}
                        </div>
                      
                      <div className="text-xs text-gray-400 mt-2">
                        View all comments
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        2 hours ago
                      </div>
                    </div>
                  </div>
                  
                  {/* Navigation Info */}
                  {runFiles.length > 1 && (
                    <div className="mt-4 text-center">
                      <p className="text-xs text-gray-500 font-mono">
                        Use arrow keys or click the arrows to navigate • {runFiles.length} slides total
                      </p>
                    </div>
                  )}
                  
                  {/* Instagram Publishing Section */}
                  {user && user.instagram_connected && (
                    <div className="mt-6 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl border border-purple-200">
                      <div className="text-center">
                        {/* Instagram Limits */}
                        {igLimits && (
                          <div className="mb-3 text-sm text-gray-600 font-mono">
                            📊 Posts remaining today: <span className="font-bold text-purple-600">{igLimits.remainingPosts}</span>
                          </div>
                        )}
                        
                        {/* Publish Button */}
                        <button
                          onClick={publishToInstagram}
                          disabled={igPublishing || (igLimits && igLimits.remainingPosts <= 0)}
                          className={`inline-flex items-center px-6 py-3 rounded-2xl font-bold transition-all duration-200 transform shadow-lg hover:shadow-xl font-mono ${
                            igPublishing 
                              ? 'bg-gray-400 cursor-not-allowed' 
                              : igLimits && igLimits.remainingPosts <= 0
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 hover:scale-105 active:scale-95'
                          } text-white`}
                        >
                          {igPublishing && (
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                            </svg>
                          )}
                          <i className={`fa-brands fa-instagram ${igPublishing ? '' : 'mr-2'}`}></i>
                          {igPublishing 
                            ? 'Publishing...' 
                            : igLimits && igLimits.remainingPosts <= 0
                              ? 'Daily Limit Reached'
                              : 'Publish to Instagram'
                          }
                        </button>
                      </div>
                      </div>
                    )}
                </div>
              )}
            </div>
          </section>
        </div>

        <section className="mt-8 bg-white/60 backdrop-blur-xl rounded-3xl border border-white/30 shadow-lg overflow-hidden">
          <div className="px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                <i className="fa-solid fa-info-circle text-white text-sm"></i>
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-800 mb-2 font-mono">System Information</h3>
                <p className="text-xs text-gray-600 leading-relaxed font-mono">
                  This dashboard runs in client mode with enhanced security. Instagram credentials are managed server-side and workflow parameters are automatically configured for optimal carousel generation.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
 
ReactDOM.createRoot(document.getElementById('root')).render(<DashboardApp />);