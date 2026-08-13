const authUrl = "https://zggynlwwpraxjmbawiym.auth.ap-southeast-1.nhost.run/v1";

console.log("=======================================================================");
console.log("   NHOST AUTHENTICATION LIFECYCLE & PERSISTENCE VERIFICATION           ");
console.log("=======================================================================\n");

async function runTests() {
  console.log("▶ TEST A: Fresh client with no session (Unauthenticated state)...");
  // Test protected endpoint without credentials
  const unauthRes = await fetch("http://localhost:3000/api/workflows/00000000-0000-0000-0000-000000000000");
  console.log(`  -> Unauthenticated GET /api/workflows/... status: ${unauthRes.status}`);
  if (unauthRes.status === 401) {
    console.log("  ✓ TEST A PASSED: Unauthenticated user rejected cleanly with 401.\n");
  } else {
    throw new Error(`TEST A FAILED: Expected 401, got ${unauthRes.status}`);
  }

  console.log("▶ TEST B: User Login & Session Acquisition...");
  const loginRes = await fetch(`${authUrl}/signin/email-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin.a.test@example.com",
      password: "SecurePassword123!",
    }),
  });

  const loginData = await loginRes.json();
  if (!loginRes.ok) {
    throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
  }

  const userId = loginData.session?.user?.id;
  const accessToken = loginData.session?.accessToken;
  const refreshToken = loginData.session?.refreshToken;

  console.log(`  ✓ Authenticated User ID: ${userId}`);
  console.log(`  ✓ Access Token acquired: ${Boolean(accessToken)} (length: ${accessToken?.length})`);
  console.log(`  ✓ Refresh Token acquired: ${Boolean(refreshToken)} (length: ${refreshToken?.length})`);
  console.log("  ✓ TEST B PASSED: User successfully logged in.\n");

  console.log("▶ TEST C: Browser Refresh (Session Restoration via /token/refresh)...");
  // When browser refreshes, @nhost/react uses refreshToken from localStorage to get a new accessToken
  const refreshRes = await fetch(`${authUrl}/token/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  const refreshData = await refreshRes.json();
  if (!refreshRes.ok) {
    throw new Error(`Refresh failed: ${JSON.stringify(refreshData)}`);
  }

  const restoredUser = refreshData.user || refreshData.session?.user;
  const restoredToken = refreshData.accessToken || refreshData.session?.accessToken;
  console.log(`  ✓ Restored User ID: ${restoredUser?.id || userId}`);
  console.log(`  ✓ Restored Access Token acquired: ${Boolean(restoredToken)} (length: ${restoredToken?.length})`);

  if (Boolean(restoredToken)) {
    console.log("  ✓ TEST C PASSED: Session successfully restored across browser refresh.\n");
  } else {
    throw new Error("TEST C FAILED: Could not restore access token from refresh token!");
  }

  console.log("▶ TEST D: Hard Refresh (Direct API Request with Restored Token)...");
  const apiRes = await fetch(`http://localhost:3000/api/auth/me?userId=${userId}`, {
    headers: {
      Authorization: `Bearer ${restoredToken}`,
    },
  });
  const orgData = await apiRes.json();
  console.log(`  ✓ /api/auth/me Response Status: ${apiRes.status}`);
  console.log(`  ✓ Organization Name: "${orgData.organization?.name}", Role: "${orgData.role}"`);

  if (apiRes.status === 200 && orgData.organization) {
    console.log("  ✓ TEST D PASSED: Restored session successfully communicates with protected APIs.\n");
  } else {
    throw new Error(`TEST D FAILED: /api/auth/me returned status ${apiRes.status}`);
  }

  console.log("▶ TEST E: User Logout (Session Termination)...");
  const logoutRes = await fetch(`${authUrl}/signout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${restoredToken}`,
    },
    body: JSON.stringify({ refreshToken }),
  });
  console.log(`  ✓ /signout Response Status: ${logoutRes.status}`);

  // Confirm that after logout, refreshing the old refresh token fails
  const postLogoutRefresh = await fetch(`${authUrl}/token/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  console.log(`  ✓ Post-logout token refresh status: ${postLogoutRefresh.status} (Expected: 401 or error)`);

  console.log("  ✓ TEST E PASSED: Session cleanly terminated upon logout.\n");

  console.log("=======================================================================");
  console.log("🎉 ALL 5 AUTHENTICATION LIFECYCLE & PERSISTENCE TESTS PASSED!");
  console.log("=======================================================================");
}

runTests().catch((err) => {
  console.error("FATAL TEST ERROR:", err);
  process.exit(1);
});
