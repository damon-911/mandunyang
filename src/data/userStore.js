import { pool } from "../utils/db.js";

// 서버 타임존 무관 KST 날짜 문자열 (YYYY-MM-DD)
export function getKstDateStr(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

// 유저 없으면 생성
async function getOrCreateUser(userId) {
  await pool.query(
    `INSERT INTO users (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );

  const res = await pool.query(
    `SELECT user_id, balance, last_attendance_date
     FROM users
     WHERE user_id = $1`,
    [userId],
  );

  return res.rows[0];
}

export async function getUser(userId) {
  return getOrCreateUser(userId);
}

export async function getBalance(userId) {
  const u = await getOrCreateUser(userId);
  return u.balance;
}

export async function addBalance(userId, amount) {
  await getOrCreateUser(userId);

  const res = await pool.query(
    `
    UPDATE users
    SET balance = balance + $2,
        updated_at = NOW()
    WHERE user_id = $1
    RETURNING user_id, balance, last_attendance_date
    `,
    [userId, amount],
  );

  return res.rows[0];
}

export async function canAttend(userId, kstDateStr = getKstDateStr()) {
  const u = await getOrCreateUser(userId);

  const last = u.last_attendance_date
    ? u.last_attendance_date.toISOString().slice(0, 10)
    : null;

  return last !== kstDateStr;
}

export async function markAttendance(userId, kstDateStr = getKstDateStr()) {
  await getOrCreateUser(userId);

  const res = await pool.query(
    `
    UPDATE users
    SET last_attendance_date = $2::date,
        updated_at = NOW()
    WHERE user_id = $1
    RETURNING user_id, balance, last_attendance_date
    `,
    [userId, kstDateStr],
  );

  return res.rows[0];
}

export async function attend(userId, kstDateStr = getKstDateStr(), reward = 0) {
  await getOrCreateUser(userId);

  const res = await pool.query(
    `
    UPDATE users
    SET balance = balance + $3,
        last_attendance_date = $2::date,
        updated_at = NOW()
    WHERE user_id = $1
    RETURNING user_id, balance, last_attendance_date
    `,
    [userId, kstDateStr, reward],
  );

  return res.rows[0];
}

export async function transferBalance(fromUserId, toUserId, amount) {
  if (amount <= 0) throw new Error("amount must be positive");
  if (fromUserId === toUserId) throw new Error("same user transfer is not allowed");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO users (user_id)
       VALUES ($1), ($2)
       ON CONFLICT (user_id) DO NOTHING`,
      [fromUserId, toUserId],
    );

    const debitRes = await client.query(
      `
      UPDATE users
      SET balance = balance - $2,
          updated_at = NOW()
      WHERE user_id = $1
        AND balance >= $2
      RETURNING user_id, balance
      `,
      [fromUserId, amount],
    );

    if (debitRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const creditRes = await client.query(
      `
      UPDATE users
      SET balance = balance + $2,
          updated_at = NOW()
      WHERE user_id = $1
      RETURNING user_id, balance
      `,
      [toUserId, amount],
    );

    await client.query("COMMIT");

    return {
      from: debitRes.rows[0],
      to: creditRes.rows[0],
      amount,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getTopBalances(limit = 10) {
  const res = await pool.query(
    `
    SELECT user_id, balance
    FROM users
    ORDER BY balance DESC, user_id ASC
    LIMIT $1
    `,
    [limit],
  );
  return res.rows;
}

export async function getTopBalancesInUsers(userIds, limit = 10) {
  if (!Array.isArray(userIds) || userIds.length === 0) return [];
  const res = await pool.query(
    `
    SELECT user_id, balance
    FROM users
    WHERE user_id = ANY($1::text[])
    ORDER BY balance DESC, user_id ASC
    LIMIT $2
    `,
    [userIds, limit],
  );
  return res.rows;
}
