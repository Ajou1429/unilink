export const USERS_STORAGE_KEY = "unilink:users";
export const CURRENT_USER_STORAGE_KEY = "unilink:current-user";

export interface StoredUser {
  id: string;
  username: string;
  passwordHash: string;
  salt: string;
  university: string;
  department: string;
  birthday: string;
  createdAt: string;
}

export interface CurrentUser {
  id: string;
  username: string;
  university: string;
  department: string;
}

export interface SignupInput {
  username: string;
  password: string;
  passwordConfirm: string;
  university: string;
  department: string;
  birthday: string;
}

function readUsers(): StoredUser[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(USERS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredUser[]) : [];
  } catch {
    return [];
  }
}

function writeUsers(users: StoredUser[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function createSalt() {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPassword(password: string, salt: string) {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await window.crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

function setCurrentUser(user: StoredUser) {
  const currentUser: CurrentUser = {
    id: user.id,
    username: user.username,
    university: user.university,
    department: user.department,
  };

  window.localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(currentUser));
}

export function getCurrentUser(): CurrentUser | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(CURRENT_USER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CurrentUser) : null;
  } catch {
    return null;
  }
}

export function logout() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
}

export async function signupWithPassword(input: SignupInput) {
  const username = normalizeUsername(input.username);
  const university = input.university.trim();
  const department = input.department.trim();

  if (!username || !input.password || !input.passwordConfirm) {
    return { ok: false, message: "아이디와 비밀번호를 입력해주세요." };
  }

  if (!university || !department || !input.birthday) {
    return { ok: false, message: "대학교, 학과, 생일을 모두 입력해주세요." };
  }

  if (input.password.length < 6) {
    return { ok: false, message: "비밀번호는 6자 이상으로 입력해주세요." };
  }

  if (input.password !== input.passwordConfirm) {
    return { ok: false, message: "비밀번호가 서로 다릅니다." };
  }

  const users = readUsers();
  if (users.some((user) => user.username === username)) {
    return { ok: false, message: "이미 사용 중인 아이디입니다." };
  }

  const salt = createSalt();
  const user: StoredUser = {
    id: `user-${Date.now()}`,
    username,
    passwordHash: await hashPassword(input.password, salt),
    salt,
    university,
    department,
    birthday: input.birthday,
    createdAt: new Date().toISOString(),
  };

  writeUsers([user, ...users]);
  setCurrentUser(user);
  return { ok: true, message: "회원가입이 완료되었습니다." };
}

export async function loginWithPassword(usernameInput: string, password: string) {
  const username = normalizeUsername(usernameInput);

  if (!username || !password) {
    return { ok: false, message: "아이디와 비밀번호를 입력해주세요." };
  }

  const user = readUsers().find((item) => item.username === username);
  if (!user) {
    return { ok: false, message: "아이디 또는 비밀번호가 올바르지 않습니다." };
  }

  const passwordHash = await hashPassword(password, user.salt);
  if (passwordHash !== user.passwordHash) {
    return { ok: false, message: "아이디 또는 비밀번호가 올바르지 않습니다." };
  }

  setCurrentUser(user);
  return { ok: true, message: "로그인되었습니다." };
}
