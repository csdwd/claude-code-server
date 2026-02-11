const fs = require('fs');
const path = require('path');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const crypto = require('crypto');

/**
 * 带文件锁的基础存储类
 */
class BaseStore {
  constructor(dataDir, dbFileName) {
    this.dataDir = dataDir;
    this.dbFileName = dbFileName;
    this.dbPath = path.join(dataDir, dbFileName);
    this.lockFilePath = this.dbPath + '.lock';
    this.db = null;
  }

  /**
   * 初始化数据库
   */
  async init() {
    // 确保数据目录存在
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    // 初始化 LowDB
    const adapter = new JSONFile(this.dbPath);
    this.db = new Low(adapter, this.getDefaultData());

    // 读取数据
    await this.db.read();

    // 如果是新文件，写入默认数据
    if (!this.db.data) {
      this.db.data = this.getDefaultData();
      await this.db.write();
    }
  }

  /**
   * 获取默认数据结构（子类需要实现）
   */
  getDefaultData() {
    return {};
  }

  /**
   * 获取文件锁
   */
  async acquireLock(timeout = 5000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        // 尝试创建锁文件（O_EXCL 标志确保原子性）
        const lockId = crypto.randomUUID();
        fs.writeFileSync(this.lockFilePath, lockId, { flag: 'wx' });
        return lockId;
      } catch (err) {
        if (err.code === 'EEXIST') {
          // 锁文件已存在，等待后重试
          await new Promise(resolve => setTimeout(resolve, 50));
        } else {
          throw err;
        }
      }
    }

    throw new Error('Failed to acquire lock: timeout');
  }

  /**
   * 释放文件锁
   */
  releaseLock(lockId) {
    try {
      // 验证锁文件中的 ID 是否匹配
      const currentLockId = fs.readFileSync(this.lockFilePath, 'utf8');
      if (currentLockId === lockId) {
        fs.unlinkSync(this.lockFilePath);
      }
    } catch (err) {
      // 忽略错误
    }
  }

  /**
   * 带锁的写入操作
   */
  async withLock(operation) {
    const lockId = await this.acquireLock();
    try {
      const result = await operation();
      await this.db.write();
      return result;
    } finally {
      this.releaseLock(lockId);
    }
  }

  /**
   * 生成 UUID
   */
  generateId() {
    return crypto.randomUUID();
  }

  /**
   * 获取当前时间戳
   */
  now() {
    return new Date().toISOString();
  }
}

module.exports = BaseStore;
