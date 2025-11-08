// frontend/src/router.js
class Router {
  constructor() {
    this.routes = {
      '/dashboard/coordinator': 'Coordinator/coordinator-dashboard.html',
      '/dashboard/marker': 'Marker/marker-dashboard.html',
      '/invite': 'Coordinator/invite.html',
      '/upload': 'Coordinator/upload-assignment.html',
      '/login': 'login.html'
    };

    this.init();
  }

  async init() {
    // 监听导航
    this.handleNavigation(window.location.pathname);

    // 拦截链接点击
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (link && link.href.startsWith(window.location.origin)) {
        e.preventDefault();
        this.navigate(link.getAttribute('href'));
      }
    });

    // 监听浏览器前进后退
    window.addEventListener('popstate', () => {
      this.handleNavigation(window.location.pathname);
    });
  }

  navigate(path) {
    window.history.pushState({}, '', path);
    this.handleNavigation(path);
  }

  async handleNavigation(path) {
    try {
      // 1. 先检查认证状态
      const authResponse = await fetch('/api/auth/me', {
        credentials: 'include'
      });

      if (!authResponse.ok) {
        // 未认证，重定向到登录页
        window.location.href = '/login';
        return;
      }

      const authData = await authResponse.json();
      const userRole = authData.user.role;

      // 2. 检查权限
      if (path.startsWith('/dashboard/coordinator') && userRole !== 'COORDINATOR') {
        alert('Access denied');
        return;
      }

      if (path.startsWith('/dashboard/marker') && userRole !== 'MARKER') {
        alert('Access denied');
        return;
      }

      // 3. 加载对应的HTML页面
      const pagePath = this.routes[path] || this.routes['/dashboard/' + userRole.toLowerCase()];
      if (!pagePath) {
        this.show404();
        return;
      }

      const pageResponse = await fetch(pagePath);
      const html = await pageResponse.text();

      // 4. 渲染页面
      document.getElementById('app').innerHTML = html;

      // 5. 执行页面特定的JS
      this.executePageScripts(pagePath, authData.user);

    } catch (error) {
      console.error('Navigation error:', error);
      this.showError();
    }
  }

  executePageScripts(pagePath, user) {
    // 根据页面路径执行对应的JS初始化
    const pageName = pagePath.split('/').pop().replace('.html', '');

    // 调用页面特定的初始化函数
    if (typeof window[`init${pageName}`] === 'function') {
      window[`init${pageName}`](user);
    }
  }

  show404() {
    document.getElementById('app').innerHTML = '<h1>Page not found</h1>';
  }

  showError() {
    document.getElementById('app').innerHTML = '<h1>Error loading page</h1>';
  }
}