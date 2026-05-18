// Cloudflare R2 网盘 - 支持浏览、上传、分享链接
// 作者：梦梦
// 版本：1.0

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const action = url.searchParams.get('action');

    // CORS 头
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // 处理预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // ==================== 页面渲染 ====================
      if (request.method === 'GET' && (path === '/' || path === '')) {
        return await this.renderHome(request, env);
      }

      // ==================== 文件上传 ====================
      if (request.method === 'POST' && path === '/upload') {
        return await this.handleUpload(request, env);
      }

      // ==================== 文件/文件夹浏览 ====================
      if (request.method === 'GET' && path.startsWith('/browse/')) {
        const prefix = path.slice(8); // 去掉 /browse/
        return await this.browseFiles(prefix, env);
      }

      // ==================== 文件下载 ====================
      if (request.method === 'GET' && path.startsWith('/d/')) {
        const key = path.slice(3);
        return await this.downloadFile(key, env);
      }

      // ==================== 分享链接（带过期时间）====================
      if (request.method === 'GET' && path.startsWith('/s/')) {
        const shareId = path.slice(3);
        return await this.getSharedFile(shareId, env);
      }

      // ==================== API: 获取文件列表 ====================
      if (request.method === 'GET' && action === 'list') {
        return await this.listFiles(env);
      }

      // ==================== API: 生成分享链接 ====================
      if (request.method === 'POST' && action === 'share') {
        return await this.createShareLink(request, env);
      }

      // ==================== API: 删除文件 ====================
      if (request.method === 'DELETE' && path.startsWith('/api/delete/')) {
        const key = path.slice(12);
        return await this.deleteFile(key, env);
      }

      // ==================== API: 获取存储使用量 ====================
      if (request.method === 'GET' && action === 'stats') {
        return await this.getStats(env);
      }

      return new Response('404 Not Found', { status: 404 });

    } catch (err) {
      return new Response(`Error: ${err.message}`, { status: 500 });
    }
  }

  // 渲染首页
  async renderHome(request, env) {
    const files = await env.MY_BUCKET.list({ limit: 100 });
    
    // 计算存储用量
    let totalSize = 0;
    files.objects.forEach(f => totalSize += f.size);

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>燕云网盘 - Cloudflare R2</title>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --primary: #8e2de2;
      --secondary: #4a00e0;
      --accent: #e94057;
      --bg: #0f0f23;
      --card-bg: #1a1a2e;
      --text: #e0e0ff;
      --text-muted: #888;
    }
    body {
      font-family: 'Microsoft YaHei', sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    
    /* 头部 */
    header {
      text-align: center;
      padding: 40px 0;
      background: linear-gradient(135deg, var(--primary), var(--accent));
      border-radius: 20px;
      margin-bottom: 30px;
    }
    header h1 { font-size: 2.5rem; margin-bottom: 10px; }
    header p { opacity: 0.9; }
    
    /* 统计卡片 */
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: var(--card-bg);
      padding: 20px;
      border-radius: 12px;
      text-align: center;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .stat-card .num { font-size: 2rem; color: var(--accent); font-weight: bold; }
    .stat-card .label { color: var(--text-muted); font-size: 0.9rem; }
    
    /* 上传区域 */
    .upload-section {
      background: var(--card-bg);
      padding: 30px;
      border-radius: 12px;
      margin-bottom: 30px;
      border: 2px dashed rgba(142,45,226,0.5);
    }
    .upload-section h3 { margin-bottom: 15px; color: var(--primary); }
    .upload-area {
      display: flex;
      gap: 15px;
      flex-wrap: wrap;
      align-items: center;
    }
    .upload-area input[type="file"] {
      flex: 1;
      padding: 12px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 8px;
      color: var(--text);
    }
    .btn {
      padding: 12px 24px;
      background: linear-gradient(135deg, var(--primary), var(--accent));
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 1rem;
      transition: transform 0.2s;
    }
    .btn:hover { transform: translateY(-2px); }
    .btn-secondary { background: var(--card-bg); border: 1px solid var(--primary); }
    
    /* 文件列表 */
    .files-section { background: var(--card-bg); padding: 30px; border-radius: 12px; }
    .files-section h3 { margin-bottom: 20px; display: flex; align-items: center; gap: 10px; }
    .file-list { list-style: none; }
    .file-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 15px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      transition: background 0.2s;
    }
    .file-item:hover { background: rgba(255,255,255,0.05); }
    .file-info { display: flex; align-items: center; gap: 15px; flex: 1; }
    .file-icon { 
      width: 40px; height: 40px; 
      display: flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg, var(--primary), var(--accent));
      border-radius: 8px;
      font-size: 1.2rem;
    }
    .file-name { font-weight: 500; }
    .file-size { color: var(--text-muted); font-size: 0.85rem; }
    .file-actions { display: flex; gap: 10px; }
    .file-actions a, .file-actions button {
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 0.85rem;
      cursor: pointer;
      text-decoration: none;
      border: none;
    }
    .btn-download { background: var(--primary); color: white; }
    .btn-share { background: var(--accent); color: white; }
    .btn-delete { background: #ff4757; color: white; }
    
    /* 分享弹窗 */
    .modal {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.8);
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .modal.show { display: flex; }
    .modal-content {
      background: var(--card-bg);
      padding: 30px;
      border-radius: 12px;
      max-width: 500px;
      width: 90%;
    }
    .modal h3 { margin-bottom: 15px; color: var(--accent); }
    .share-link {
      width: 100%;
      padding: 12px;
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 8px;
      color: var(--text);
      margin: 10px 0;
    }
    .copy-btn { width: 100%; }
    
    /* 空状态 */
    .empty { text-align: center; padding: 40px; color: var(--text-muted); }
    
    /* 加载动画 */
    .loading { text-align: center; padding: 20px; }
    .spinner {
      width: 40px; height: 40px;
      border: 4px solid rgba(255,255,255,0.1);
      border-top-color: var(--primary);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    
    /* 通知 */
    .toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: var(--accent);
      color: white;
      padding: 15px 25px;
      border-radius: 8px;
      transform: translateY(100px);
      transition: transform 0.3s;
    }
    .toast.show { transform: translateY(0); }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>📁 燕云网盘</h1>
      <p>基于 Cloudflare R2 + Workers | 免费高速无限流量</p>
    </header>
    
    <div class="stats">
      <div class="stat-card">
        <div class="num">${files.objects.length}</div>
        <div class="label">文件数量</div>
      </div>
      <div class="stat-card">
        <div class="num">${this.formatSize(totalSize)}</div>
        <div class="label">已用存储</div>
      </div>
      <div class="stat-card">
        <div class="num">免费</div>
        <div class="label">无限流量</div>
      </div>
    </div>
    
    <div class="upload-section">
      <h3><i class="fas fa-cloud-upload-alt"></i> 上传文件</h3>
      <form id="uploadForm" class="upload-area">
        <input type="file" name="file" id="fileInput" required>
        <button type="submit" class="btn">
          <i class="fas fa-upload"></i> 上传
        </button>
      </form>
      <div id="uploadProgress" class="loading" style="display:none;">
        <div class="spinner"></div>
        <p>上传中...</p>
      </div>
    </div>
    
    <div class="files-section">
      <h3><i class="fas fa-folder-open"></i> 文件列表</h3>
      <ul class="file-list" id="fileList">
        ${files.objects.length === 0 
          ? '<li class="empty">暂无文件，上传一个开始使用~</li>'
          : files.objects.map(f => `
          <li class="file-item" data-key="${f.key}">
            <div class="file-info">
              <div class="file-icon">${this.getFileIcon(f.key)}</div>
              <div>
                <div class="file-name">${f.key}</div>
                <div class="file-size">${this.formatSize(f.size)} | ${new Date(f.uploaded).toLocaleString()}</div>
              </div>
            </div>
            <div class="file-actions">
              <a href="/d/${encodeURIComponent(f.key)}" class="btn-download" target="_blank">
                <i class="fas fa-download"></i> 下载
              </a>
              <button class="btn-share" onclick="shareFile('${f.key}')">
                <i class="fas fa-share-alt"></i> 分享
              </button>
              <button class="btn-delete" onclick="deleteFile('${f.key}')">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </li>
        `).join('')}
      </ul>
    </div>
  </div>
  
  <!-- 分享弹窗 -->
  <div class="modal" id="shareModal">
    <div class="modal-content">
      <h3><i class="fas fa-link"></i> 分享链接</h3>
      <p>复制下方链接分享给好友（链接24小时有效）：</p>
      <input type="text" class="share-link" id="shareLink" readonly>
      <button class="btn copy-btn" onclick="copyShareLink()">
        <i class="fas fa-copy"></i> 复制链接
      </button>
      <button class="btn btn-secondary" style="margin-top:10px;width:100%" onclick="closeModal()">
        关闭
      </button>
    </div>
  </div>
  
  <!-- 通知 -->
  <div class="toast" id="toast"></div>
  
  <script>
    // 显示通知
    function showToast(msg) {
      const toast = document.getElementById('toast');
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    }
    
    // 上传文件
    document.getElementById('uploadForm').onsubmit = async (e) => {
      e.preventDefault();
      const fileInput = document.getElementById('fileInput');
      const file = fileInput.files[0];
      if (!file) return;
      
      document.getElementById('uploadProgress').style.display = 'block';
      
      const formData = new FormData();
      formData.append('file', file);
      
      try {
        const res = await fetch('/upload', {
          method: 'POST',
          body: formData
        });
        if (res.ok) {
          showToast('✅ 上传成功！');
          setTimeout(() => location.reload(), 1000);
        } else {
          showToast('❌ 上传失败');
        }
      } catch (err) {
        showToast('❌ 错误: ' + err.message);
      }
      document.getElementById('uploadProgress').style.display = 'none';
    };
    
    // 分享文件
    async function shareFile(filename) {
      const res = await fetch('/api/share?filename=' + encodeURIComponent(filename));
      const data = await res.json();
      if (data.shareUrl) {
        document.getElementById('shareLink').value = data.shareUrl;
        document.getElementById('shareModal').classList.add('show');
      }
    }
    
    // 复制分享链接
    function copyShareLink() {
      const input = document.getElementById('shareLink');
      input.select();
      document.execCommand('copy');
      showToast('✅ 链接已复制！');
    }
    
    // 删除文件
    async function deleteFile(filename) {
      if (!confirm('确定要删除 ' + filename + ' 吗？')) return;
      
      const res = await fetch('/api/delete/' + encodeURIComponent(filename), {
        method: 'DELETE'
      });
      if (res.ok) {
        showToast('✅ 已删除');
        setTimeout(() => location.reload(), 1000);
      } else {
        showToast('❌ 删除失败');
      }
    }
    
    // 关闭弹窗
    function closeModal() {
      document.getElementById('shareModal').classList.remove('show');
    }
  </script>
</body>
</html>`;

    return new Response(html, {
      headers: { 'Content-Type': 'text/html;charset=UTF-8', ...corsHeaders }
    });
  }

  // 处理文件上传
  async handleUpload(request, env) {
    const formData = await request.formData();
    const file = formData.get('file');
    
    if (!file) {
      return new Response('No file provided', { status: 400 });
    }

    // 生成唯一文件名（保留原名 + 时间戳）
    const timestamp = Date.now();
    const originalName = file.name;
    const safeName = `${timestamp}-${originalName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    
    await env.MY_BUCKET.put(safeName, file.stream(), {
      httpMetadata: {
        contentType: file.type || 'application/octet-stream'
      }
    });

    return new Response('Upload success', {
      status: 302,
      headers: { 
        'Location': '/',
        ...corsHeaders 
      }
    });
  }

  // 浏览文件夹
  async browseFiles(prefix, env) {
    const objects = await env.MY_BUCKET.list({ prefix, delimiter: '/' });
    
    let html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>浏览: ${prefix}</title>
<style>
body{font-family:sans-serif;background:#0f0f23;color:#e0e0ff;padding:20px;}
a{color:#8e2de2;text-decoration:none;}
.back{background:#1a1a2e;padding:15px;border-radius:8px;margin-bottom:20px;}
.file{background:#1a1a2e;padding:12px;margin:8px 0;border-radius:6px;}
</style></head>
<body>
<h2>📁 ${prefix || '根目录'}</h2>
<div class="back"><a href="/">← 返回根目录</a></div>`;

    // 文件夹
    if (objects.commonPrefixes) {
      objects.commonPrefixes.forEach(p => {
        html += `<div class="file">📁 <a href="/browse/${p}">${p}</a></div>`;
      });
    }
    
    // 文件
    if (objects.objects) {
      objects.objects.forEach(o => {
        html += `<div class="file">
          📄 <a href="/d/${encodeURIComponent(o.key)}">${o.key}</a> 
          (${this.formatSize(o.size)})
        </div>`;
      });
    }
    
    html += '</body></html>';
    
    return new Response(html, { headers: { 'Content-Type': 'text/html', ...corsHeaders }});
  }

  // 下载文件
  async downloadFile(key, env) {
    const object = await env.MY_BUCKET.get(decodeURIComponent(key));
    
    if (!object) {
      return new Response('File not found', { status: 404 });
    }

    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${key}"`,
        'Content-Length': object.size,
        'Cache-Control': 'public, max-age=31536000',
        ...corsHeaders
      }
    });
  }

  // 创建分享链接（存储到 KV）
  async createShareLink(request, env) {
    const url = new URL(request.url);
    const filename = url.searchParams.get('filename');
    
    if (!filename) {
      return new Response(JSON.stringify({ error: 'Filename required' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // 生成短 ID
    const shareId = Math.random().toString(36).substring(2, 10);
    const expiry = Date.now() + 24 * 60 * 60 * 1000; // 24小时
    
    // 存储到 KV（需要创建 KV 命名空间）
    // 这里用 R2 元数据模拟
    const shareData = JSON.stringify({ filename, expiry });
    await env.MY_BUCKET.put(`share:${shareId}`, shareData);

    const shareUrl = `${new URL(request.url).origin}/s/${shareId}`;
    
    return new Response(JSON.stringify({ shareUrl, expiry: new Date(expiry).toLocaleString() }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  // 获取分享文件
  async getSharedFile(shareId, env) {
    const object = await env.MY_BUCKET.get(`share:${shareId}`);
    
    if (!object) {
      return new Response('Share link expired or not found', { status: 404 });
    }

    const data = JSON.parse(await object.text());
    
    // 检查是否过期
    if (Date.now() > data.expiry) {
      return new Response('Share link expired', { status: 410 });
    }

    // 重定向到下载
    return new Response(null, {
      status: 302,
      headers: { 'Location': `/d/${encodeURIComponent(data.filename)}` }
    });
  }

  // 列出文件（API）
  async listFiles(env) {
    const objects = await env.MY_BUCKET.list({ limit: 100 });
    
    return new Response(JSON.stringify({
      files: objects.objects.map(f => ({
        name: f.key,
        size: f.size,
        uploaded: f.uploaded
      }))
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  // 删除文件
  async deleteFile(key, env) {
    await env.MY_BUCKET.delete(decodeURIComponent(key));
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  // 获取统计
  async getStats(env) {
    const objects = await env.MY_BUCKET.list({ limit: 1000 });
    const totalSize = objects.objects.reduce((sum, f) => sum + f.size, 0);
    
    return new Response(JSON.stringify({
      fileCount: objects.objects.length,
      totalSize,
      formattedSize: this.formatSize(totalSize)
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  // 工具函数：格式化文件大小
  formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // 工具函数：获取文件图标
  getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
      jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️',
      mp4: '🎬', mkv: '🎬', avi: '🎬', mov: '🎬',
      mp3: '🎵', wav: '🎵', flac: '🎵',
      zip: '📦', rar: '📦', '7z': '📦', tar: '📦', gz: '📦',
      pdf: '📕', doc: '📝', docx: '📝', txt: '📝',
      xls: '📊', xlsx: '📊', ppt: '📽️', pptx: '📽️',
      js: '💻', ts: '💻', py: '💻', html: '💻', css: '💻',
      json: '📋', xml: '📋', yaml: '📋',
    };
    return icons[ext] || '📄';
  }
};
