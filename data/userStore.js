import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve('./data');
const FILE = path.join(DATA_DIR, 'users.json');

function ensureFile() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({}, null, 2));
}

function load() {
    ensureFile();
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

function save(data) {
    ensureFile();
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

export function getUser(userId) {
    const data = load();
    if (!data[userId]) {
        data[userId] = { money: 0, lastAttendance: null };
        save(data);
    }
    return data[userId];
}

export function addMoney(userId, amount) {
    const data = load();
    if (!data[userId]) data[userId] = { money: 0, lastAttendance: null };
    data[userId].money += amount;
    save(data);
    return data[userId].money;
}

export function canAttend(userId, today) {
    const user = getUser(userId);
    return user.lastAttendance !== today;
}

export function attend(userId, today, reward) {
    const data = load();
    if (!data[userId]) data[userId] = { money: 0, lastAttendance: null };
    data[userId].money += reward;
    data[userId].lastAttendance = today;
    save(data);
    return data[userId];
}
