import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "./supabase-client";

export const USERS_STORAGE_KEY = "unilink:users";
export const CURRENT_USER_STORAGE_KEY = "unilink:current-user";
export const AUTH_CHANGED_EVENT = "unilink:authChanged";

export interface StoredUser {
  id: string;
  username: string;
  displayName: string;
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
  displayName: string;
  university: string;
  department: string;
}

export interface SignupInput {
  username: string;
  displayName: string;
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

function validateInput(input: SignupInput) {
  const username = normalizeUsername(input.username);
  const displayName = input.displayName.trim();
  const university = input.university.trim();
  const department = input.department.trim();

  if (!username || !displayName || !input.password || !input.passwordConfirm) {
    return "아이디, 사용자 이름, 비밀번호를 입력해주세요.";
  }

  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    return "아이디는 영문, 숫자, 점, 밑줄, 하이픈 조합으로 3~32자까지 입력해주세요.";
  }

  if (!university || !department || !input.birthday) {
    return "대학교, 학과, 생일을 모두 입력해주세요.";
  }

  if (input.password.length < 6) {
    return "비밀번호는 6자 이상으로 입력해주세요.";
  }

  if (input.password !== input.passwordConfirm) {
    return "비밀번호가 서로 다릅니다.";
  }

  return null;
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

function setCurrentUser(user: CurrentUser) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

function setCurrentStoredUser(user: StoredUser) {
  setCurrentUser({
    id: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    university: user.university,
    department: user.department,
  });
}

function setCurrentSupabaseUser(user: User) {
  const fallbackUsername = user.email?.split("@")[0] ?? "user";
  const username =
    typeof user.user_metadata.username === "string"
      ? user.user_metadata.username
      : fallbackUsername;
  const displayName =
    typeof user.user_metadata.displayName === "string"
      ? user.user_metadata.displayName
      : typeof user.user_metadata.full_name === "string"
        ? user.user_metadata.full_name
        : username;

  setCurrentUser({
    id: user.id,
    username,
    displayName,
    university:
      typeof user.user_metadata.university === "string"
        ? user.user_metadata.university
        : "",
    department:
      typeof user.user_metadata.department === "string"
        ? user.user_metadata.department
        : "",
  });
}

function usernameToEmail(username: string) {
  return `${username}@users.unilink.app`;
}

async function saveSupabaseProfile(input: SignupInput, userId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;

  await supabase.from("profiles").upsert(
    {
      id: userId,
      username: normalizeUsername(input.username),
      display_name: input.displayName.trim(),
      university: input.university.trim(),
      department: input.department.trim(),
      birthday: input.birthday,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
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

  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    void supabase.auth.signOut();
  }

  window.localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export async function updateDisplayName(displayNameInput: string) {
  const displayName = displayNameInput.trim();
  const currentUser = getCurrentUser();

  if (!currentUser) {
    return { ok: false, message: "로그인 후 사용자 이름을 변경할 수 있습니다." };
  }

  if (!displayName) {
    return { ok: false, message: "사용자 이름을 입력해주세요." };
  }

  if (displayName.length > 30) {
    return { ok: false, message: "사용자 이름은 30자 이하로 입력해주세요." };
  }

  const supabase = getSupabaseBrowserClient();

  if (supabase) {
    const { data, error } = await supabase.auth.updateUser({
      data: {
        displayName,
        full_name: displayName,
      },
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    if (data.user) {
      setCurrentSupabaseUser(data.user);
      await supabase
        .from("profiles")
        .update({
          display_name: displayName,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.user.id);
    } else {
      setCurrentUser({ ...currentUser, displayName });
    }

    return { ok: true, message: "사용자 이름이 변경되었습니다." };
  }

  const users = readUsers().map((user) =>
    user.id === currentUser.id || user.username === currentUser.username
      ? { ...user, displayName }
      : user,
  );

  writeUsers(users);
  setCurrentUser({ ...currentUser, displayName });
  return { ok: true, message: "사용자 이름이 변경되었습니다." };
}

export async function signupWithPassword(input: SignupInput) {
  const validationMessage = validateInput(input);
  if (validationMessage) {
    return { ok: false, message: validationMessage };
  }

  const username = normalizeUsername(input.username);
  const displayName = input.displayName.trim();
  const university = input.university.trim();
  const department = input.department.trim();
  const supabase = getSupabaseBrowserClient();

  if (supabase) {
    const { data, error } = await supabase.auth.signUp({
      email: usernameToEmail(username),
      password: input.password,
      options: {
        data: {
          username,
          displayName,
          full_name: displayName,
          university,
          department,
          birthday: input.birthday,
        },
        emailRedirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/dashboard`
            : undefined,
      },
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    if (data.user) {
      setCurrentSupabaseUser(data.user);
      await saveSupabaseProfile(input, data.user.id);
    }

    return { ok: true, message: "회원가입이 완료되었습니다." };
  }

  const users = readUsers();
  if (users.some((user) => user.username === username)) {
    return { ok: false, message: "이미 사용 중인 아이디입니다." };
  }

  const salt = createSalt();
  const user: StoredUser = {
    id: `user-${Date.now()}`,
    username,
    displayName,
    passwordHash: await hashPassword(input.password, salt),
    salt,
    university,
    department,
    birthday: input.birthday,
    createdAt: new Date().toISOString(),
  };

  writeUsers([user, ...users]);
  setCurrentStoredUser(user);
  return { ok: true, message: "회원가입이 완료되었습니다." };
}

export async function loginWithPassword(usernameInput: string, password: string) {
  const username = normalizeUsername(usernameInput);

  if (!username || !password) {
    return { ok: false, message: "아이디와 비밀번호를 입력해주세요." };
  }

  const supabase = getSupabaseBrowserClient();

  if (supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });

    if (error || !data.user) {
      return {
        ok: false,
        message: error?.message ?? "아이디 또는 비밀번호가 올바르지 않습니다.",
      };
    }

    setCurrentSupabaseUser(data.user);
    return { ok: true, message: "로그인되었습니다." };
  }

  const user = readUsers().find((item) => item.username === username);
  if (!user) {
    return { ok: false, message: "아이디 또는 비밀번호가 올바르지 않습니다." };
  }

  const passwordHash = await hashPassword(password, user.salt);
  if (passwordHash !== user.passwordHash) {
    return { ok: false, message: "아이디 또는 비밀번호가 올바르지 않습니다." };
  }

  setCurrentStoredUser(user);
  return { ok: true, message: "로그인되었습니다." };
}
