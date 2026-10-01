import { setStorageUser } from "./private-storage";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "./supabase-client";
import { isValidPassword } from "./password-policy";

export const USERS_STORAGE_KEY = "unilink:users";
export const CURRENT_USER_STORAGE_KEY = "unilink:current-user";
export const AUTH_CHANGED_EVENT = "unilink:authChanged";

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

  if (!isValidPassword(input.password)) {
    return "비밀번호는 10자 이상이며 영문 대문자·소문자·숫자·특수기호를 모두 포함해야 합니다.";
  }

  if (input.password !== input.passwordConfirm) {
    return "비밀번호가 서로 다릅니다.";
  }

  return null;
}

let currentUser: CurrentUser | null = null;
function setCurrentUser(user: CurrentUser | null) {
  currentUser = user;
  setStorageUser(user?.id ?? null);
  if (typeof window !== "undefined") {
    try { window.localStorage.removeItem(CURRENT_USER_STORAGE_KEY); } catch { /* Storage may be disabled. */ }
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
  }
}

export function applyAuthenticatedUser(user: User | null) {
  if (user) setCurrentSupabaseUser(user);
  else setCurrentUser(null);
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

export function getCurrentUser(): CurrentUser | null { return currentUser; }

export async function logout() {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw new Error("서버 로그아웃에 실패했습니다. 다시 시도해주세요.");
  }
  setCurrentUser(null);
  if (typeof window !== "undefined") window.sessionStorage.removeItem("unilink:drive-oauth-proof");
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

  return { ok: false, message: "계정 서비스가 설정되지 않았습니다." };
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

    if (data.user && data.session) {
      setCurrentSupabaseUser(data.user);
      await saveSupabaseProfile(input, data.user.id);
      return { ok: true, message: "회원가입이 완료되었습니다." };
    }
    return { ok: false, message: "가입 요청이 접수되었습니다. 인증을 완료한 뒤 로그인해주세요." };
  }

  return { ok: false, message: "계정 서비스가 설정되지 않아 회원가입할 수 없습니다. 데모에는 개인정보를 입력하지 마세요." };
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

  return { ok: false, message: "계정 서비스가 설정되지 않아 로그인할 수 없습니다." };
}
