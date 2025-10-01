const MOJANG_PROFILE_URL = "https://api.mojang.com/users/profiles/minecraft/";
const REWARDS_URL = "https://rewards.vaulthunters.gg/rewards?minecraft=";
const TIER_URL = "https://api.vaulthunters.gg/users/reward?uuid=";

const INVALID_UUID_LENGTH = 32;

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const username = (url.searchParams.get("username") || "").trim();

  if (!username) {
    return json({ error: "Username query parameter is required." }, 400);
  }

  try {
    const mojangResponse = await fetch(`${MOJANG_PROFILE_URL}${encodeURIComponent(username)}`);

    if ([204, 404].includes(mojangResponse.status)) {
      return json({ error: "Player not found." }, 404);
    }

    if (mojangResponse.status === 400) {
      return json({ error: "Invalid Minecraft username." }, 400);
    }

    if (!mojangResponse.ok) {
      throw new Error(`Mojang API error: ${mojangResponse.status}`);
    }

    const mojangData = await mojangResponse.json();
    const rawId = mojangData?.id;
    const formattedId = formatUuid(rawId);

    if (!rawId || !formattedId) {
      throw new Error("Invalid Mojang response: missing UUID.");
    }

    const headUrl = `https://mc-heads.net/avatar/${rawId}`;
    const { rewards, sets } = await fetchRewards(formattedId);
    const tier = await fetchTiers(formattedId);

    return json({
      id: rawId,
      name: mojangData.name,
      head: headUrl,
      rewards,
      sets,
      tier
    });
  } catch (error) {
    console.error("Profile lookup error:", error);
    return json({ error: "Failed to retrieve player data." }, 500);
  }
}

function formatUuid(hexId) {
  if (!hexId || hexId.length !== INVALID_UUID_LENGTH) {
    return null;
  }

  return `${hexId.slice(0, 8)}-${hexId.slice(8, 12)}-${hexId.slice(12, 16)}-${hexId.slice(16, 20)}-${hexId.slice(20)}`;
}

async function fetchRewards(formattedId) {
  try {
    const response = await fetch(`${REWARDS_URL}${encodeURIComponent(formattedId)}`);

    if (response.status === 404) {
      return { rewards: {}, sets: [] };
    }

    if (!response.ok) {
      throw new Error(`Rewards API error: ${response.status}`);
    }

    const data = await response.json();
    const rewards = Array.isArray(data.rewards) ? {} : data.rewards || {};
    const sets = Array.isArray(data.sets) ? data.sets : data.sets || [];

    return { rewards, sets };
  } catch (error) {
    console.error("Rewards fetch error:", error);
    return { rewards: {}, sets: [] };
  }
}

async function fetchTiers(formattedId) {
  try {
    const response = await fetch(`${TIER_URL}${encodeURIComponent(formattedId)}`);

    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      throw new Error(`Tier API error: ${response.status}`);
    }

    const data = await response.json();
    return Array.isArray(data.tier) ? data.tier : [];
  } catch (error) {
    console.error("Tier fetch error:", error);
    return [];
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}
