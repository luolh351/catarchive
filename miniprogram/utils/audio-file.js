// 音频以文件形式转发，不伪装成微信语音消息，也不通过改后缀转换格式。
function invoke(target, method, options) {
  return new Promise((resolve, reject) => {
    if (!target || typeof target[method] !== 'function') {
      reject(new Error('当前微信版本不支持此操作，请更新微信后重试'));
      return;
    }
    target[method](Object.assign({}, options, { success: resolve, fail: reject }));
  });
}

function fileName(source, name) {
  let path = String(source).split(/[?#]/)[0];
  try { path = decodeURIComponent(path); } catch (e) {}
  const ext = path.match(/\.(mp3|wav|m4a|aac|silk|ogg|flac|amr|opus)$/i);
  const base = String(name || '猫咪').replace(/[\\/:*?"<>|\x00-\x1f]/g, '').trim().slice(0, 60) || '猫咪';
  return base + '的叫声.' + (ext ? ext[1].toLowerCase() : 'audio');
}

async function prepare(api, source, name) {
  if (!source) throw new Error('没有可用的音频');
  let localPath = source;
  if (source.indexOf('cloud://') === 0) {
    const res = await invoke(api.cloud, 'downloadFile', { fileID: source });
    localPath = res.tempFilePath;
  } else if (/^https?:\/\//.test(source)) {
    const res = await invoke(api, 'downloadFile', { url: source });
    if (res.statusCode !== 200) throw new Error('下载失败（HTTP ' + res.statusCode + '）');
    localPath = res.tempFilePath;
  }
  if (!localPath) throw new Error('下载未返回音频文件');
  const fs = api.getFileSystemManager();
  const info = await invoke(fs, 'getFileInfo', { filePath: localPath });
  if (!info.size) throw new Error('音频文件为空，请重新上传');
  const nameOnDisk = fileName(source, name);
  const path = api.env.USER_DATA_PATH + '/cat-audio-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-' + nameOnDisk;
  // 使用带正确后缀的持久本地副本，避免转发时只指定显示名、实际路径无后缀。
  await invoke(fs, 'copyFile', { srcPath: localPath, destPath: path });
  return { path, fileName: nameOnDisk };
}

function isCancelled(error) {
  return /cancel/i.test((error && (error.errMsg || error.message)) || '');
}

// 清理本地音频副本：删除用户目录下所有 cat-audio- 开头的文件（可排除一个保留）。
// 存储策略：管理员查看投稿时自动下载，离开管理台即删除——本地不留不必要的数据。
function cleanup(api, exceptPath) {
  return new Promise(resolve => {
    let fs;
    try { fs = api.getFileSystemManager(); } catch (e) { resolve(); return; }
    fs.readdir({
      dirPath: api.env.USER_DATA_PATH,
      success: r => {
        const files = (r.files || []).filter(f => f.indexOf('cat-audio-') === 0 && f !== exceptPath);
        if (!files.length) { resolve(); return; }
        let left = files.length;
        files.forEach(f => {
          fs.unlink({ filePath: api.env.USER_DATA_PATH + '/' + f, complete: () => { if (--left === 0) resolve(); } });
        });
      },
      fail: () => resolve()
    });
  });
}

module.exports = { invoke, fileName, prepare, isCancelled, cleanup };
