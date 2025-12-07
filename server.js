const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const path = require('path');

const app = express();
const PORT = 3000;

// MySQL 연결 풀 생성
const pool = mysql.createPool({
  host: 'localhost',
  user: 'ptuser',
  password: 'ptpassword',
  database: 'periodic_table',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 미들웨어 설정
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 정적 파일 제공 (이미지, CSS, JS 등)
app.use(express.static(path.join(__dirname, 'public')));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: 'periodic-table-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24시간
}));

// 라우트: 메인 페이지
app.get('/', async (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  
  try {
    const [favorites] = await pool.query(
      'SELECT element_number FROM favorites WHERE user_id = ?',
      [req.session.userId]
    );
    
    const favoriteNumbers = favorites.map(f => f.element_number);
    
    res.render('index', {
      username: req.session.username,
      favorites: favoriteNumbers
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).send('서버 오류가 발생했습니다.');
  }
});

// 라우트: 로그인 페이지
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// 라우트: 회원가입 처리
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    // 중복 확인
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );
    
    if (existing.length > 0) {
      return res.render('login', { error: '이미 존재하는 사용자명입니다.' });
    }
    
    // 사용자 생성
    const [result] = await pool.query(
      'INSERT INTO users (username, password) VALUES (?, ?)',
      [username, password]
    );
    
    req.session.userId = result.insertId;
    req.session.username = username;
    res.redirect('/');
  } catch (error) {
    console.error('Registration error:', error);
    res.render('login', { error: '회원가입 중 오류가 발생했습니다.' });
  }
});

// 라우트: 로그인 처리
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const [users] = await pool.query(
      'SELECT id, username FROM users WHERE username = ? AND password = ?',
      [username, password]
    );
    
    if (users.length === 0) {
      return res.render('login', { error: '사용자명 또는 비밀번호가 잘못되었습니다.' });
    }
    
    req.session.userId = users[0].id;
    req.session.username = users[0].username;
    res.redirect('/');
  } catch (error) {
    console.error('Login error:', error);
    res.render('login', { error: '로그인 중 오류가 발생했습니다.' });
  }
});

// 라우트: 로그아웃
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// API: 즐겨찾기 일괄 추가/제거
app.post('/api/favorite-batch', async (req, res) => {
  if (!req.session.userId) {
    return res.json({ success: false, message: 'Not logged in' });
  }
  
  const { elementNumber, action } = req.body;
  
  try {
    if (action === 'add') {
      // 이미 있는지 확인 후 추가
      const [existing] = await pool.query(
        'SELECT id FROM favorites WHERE user_id = ? AND element_number = ?',
        [req.session.userId, elementNumber]
      );
      
      if (existing.length === 0) {
        await pool.query(
          'INSERT INTO favorites (user_id, element_number) VALUES (?, ?)',
          [req.session.userId, elementNumber]
        );
      }
    } else if (action === 'remove') {
      // 있으면 삭제
      await pool.query(
        'DELETE FROM favorites WHERE user_id = ? AND element_number = ?',
        [req.session.userId, elementNumber]
      );
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Favorite batch error:', error);
    res.json({ success: false, message: 'Database error' });
  }
});

// API: 현재 즐겨찾기 목록 가져오기
app.get('/api/favorites', async (req, res) => {
  if (!req.session.userId) {
    return res.json({ success: false, message: 'Not logged in' });
  }
  
  try {
    const [favorites] = await pool.query(
      'SELECT element_number FROM favorites WHERE user_id = ?',
      [req.session.userId]
    );
    
    const favoriteNumbers = favorites.map(f => f.element_number);
    res.json({ success: true, favorites: favoriteNumbers });
  } catch (error) {
    console.error('Get favorites error:', error);
    res.json({ success: false, message: 'Database error' });
  }
});

// API: 즐겨찾기 토글
app.post('/api/favorite', async (req, res) => {
  if (!req.session.userId) {
    return res.json({ success: false, message: 'Not logged in' });
  }
  
  const { elementNumber } = req.body;
  
  try {
    // 즐겨찾기 존재 확인
    const [existing] = await pool.query(
      'SELECT id FROM favorites WHERE user_id = ? AND element_number = ?',
      [req.session.userId, elementNumber]
    );
    
    if (existing.length > 0) {
      // 즐겨찾기 삭제
      await pool.query(
        'DELETE FROM favorites WHERE user_id = ? AND element_number = ?',
        [req.session.userId, elementNumber]
      );
    } else {
      // 즐겨찾기 추가
      await pool.query(
        'INSERT INTO favorites (user_id, element_number) VALUES (?, ?)',
        [req.session.userId, elementNumber]
      );
    }
    
    // 현재 즐겨찾기 목록 반환
    const [favorites] = await pool.query(
      'SELECT element_number FROM favorites WHERE user_id = ?',
      [req.session.userId]
    );
    
    const favoriteNumbers = favorites.map(f => f.element_number);
    
    res.json({ success: true, favorites: favoriteNumbers });
  } catch (error) {
    console.error('Favorite toggle error:', error);
    res.json({ success: false, message: 'Database error' });
  }
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`서버가 http://localhost:${PORT} 에서 실행중입니다.`);
  console.log('MySQL 데이터베이스에 연결되었습니다.');
});