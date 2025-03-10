const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');
const url = require('url');
const tunnel = require('tunnel');

const app = express();
app.use(cors());
const port = process.env.PORT || 8000;

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2NzQzNDc3OWI5MDJhNjJlMThhMmI4MjkiLCJpYXQiOjE3NDE0NDUyOTgsImV4cCI6MTc0OTIyMTI5OH0.5GISe3Le9vWCPikwFvevNf4eVxyJJdsGg0ZZSt-xd2c';

/**
 * Hàm checkWebsite sử dụng proxyConfig để kiểm tra domain
 * @param {Object} proxyConfig - Cấu hình proxy (bao gồm host, port, auth và name)
 * @param {String} targetUrl - Domain cần kiểm tra (vd: 'example.com')
 * @returns {Promise<Object>} - Kết quả kiểm tra của proxy đó
 */
function checkWebsite(proxyConfig, targetUrl) {
  try {
    if (!targetUrl.startsWith('http')) {
      targetUrl = 'https://' + targetUrl;
    }

    return new Promise((resolve, reject) => {
      const targetUrlObj = new url.URL(targetUrl);

      // Tạo agent tunnel cho HTTPS qua proxy HTTP
      const agent = tunnel.httpsOverHttp({
        proxy: {
          host: proxyConfig.host,
          port: proxyConfig.port,
          proxyAuth: `${proxyConfig.auth.username}:${proxyConfig.auth.password}`,
          headers: {
            'User-Agent': 'Node'
          }
        }
      });

      // Cấu hình options cho HTTPS request
      const options = {
        host: targetUrlObj.hostname,
        port: targetUrlObj.port || 443,
        secureProtocol: 'TLSv1_2_method',
        path: targetUrlObj.pathname + targetUrlObj.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': '*/*',
          'Connection': 'close'
        },
        agent: agent,
        timeout: 10000,
        rejectUnauthorized: false
      };

      console.log(`Đang kiểm tra ${targetUrl} qua proxy ${proxyConfig.host}:${proxyConfig.port} (${proxyConfig.name})`);

      let timedOut = false;

      const req = https.get(options, (res) => {
        let data = '';
        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          let status = (res.statusCode === 200) ? 'OK' : 'BLOCKED';
          resolve({
            name: proxyConfig.name,
            statusCode: res.statusCode,
            result: status,
          });
        });
      });

      req.on('timeout', () => {
        timedOut = true;
        req.destroy();
        resolve({
          name: proxyConfig.name,
          proxy: `${proxyConfig.host}:${proxyConfig.port}`,
          error: 'Timeout',
          result: 'BLOCKED',
          details: 'Connection timeout'
        });
      });

      req.on('error', (error) => {
        if (timedOut) return;
        resolve({
          name: proxyConfig.name,
          proxy: `${proxyConfig.host}:${proxyConfig.port}`,
          error: error.message,
          result: 'BLOCKED',
          details: `Connection error: ${error.message}`
        });
      });
    });
  } catch (err) {
    return {
      name: proxyConfig.name,
      error: 'Unexpected error',
      result: 'BLOCKED',
      details: err.message
    };
  }
}

// hiện tại nhà cung cấp chua  cung cấp name nên gắn như này trước
function assignProxyName(proxy) {
  if (proxy.name) return proxy.name;

  if (proxy.portHttp == 45658) {
    return 'MOBIFONE 4G';
  } else if (proxy.portHttp == 40229) {
    return 'FPT INTERNET';
  } else if (proxy.portHttp == 45577) {
    return 'VIETTEL INTERNET';
  } else if (proxy.portHttp == 54809) {
    return 'VINA 4G';
  }
}

// fetch data api từ nhà cung cấp
async function fetchProxiesFromAPI(token) {
  try {
    const response = await axios.get('https://api.zingproxy.com/proxy/get-all-active-proxies', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 200) {
      return response.data;
    } else {
      throw new Error(`Failed to fetch proxies: ${response.status}`);
    }
  } catch (error) {
    console.error('Error fetching proxies:', error.message);
    return null;
  }
}

app.get('/site', async (req, res) => {
  const domain = req.query.domain;
  if (!domain) {
    return res.status(400).json({ error: 'Missing domain parameter' });
  }

  const proxiesFromAPI = await fetchProxiesFromAPI(token);

  if (!proxiesFromAPI) {
    return res.status(500).json({ error: 'Failed to fetch proxies from API' });
  }

  const newProxy = {
    name: 'VNPT INTERNET',
    ip: '14.188.187.203',
    portHttp: '36512',
    username: 'gAcrPn',
    password: 'UCzGWB'
  };

  proxiesFromAPI.proxiesDancuVietnam.push(newProxy);

  const formattedProxies = proxiesFromAPI.proxiesDancuVietnam.map(proxy => ({
    name: assignProxyName(proxy),
    host: proxy.ip,
    port: proxy.portHttp,
    auth: {
      username: proxy.username || '',
      password: proxy.password || ''
    }
  }));

  try {
    const results = await Promise.all(
      formattedProxies.map(proxy => checkWebsite(proxy, domain))
    );
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
