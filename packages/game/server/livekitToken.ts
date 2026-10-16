import type { Connect } from 'vite';
import { AccessToken } from 'livekit-server-sdk';

const TOKEN_PATH = '/api/livekit/token';

const ROLES = {
    publisher: { canPublish: true, canSubscribe: true, canPublishData: true },
    controller: { canPublish: false, canSubscribe: true, canPublishData: true },
} as const;

type Role = keyof typeof ROLES;

function json(res: Parameters<Connect.NextHandleFunction>[1], status: number, body: unknown): void {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
}

export const livekitTokenMiddleware: Connect.NextHandleFunction = async (req, res, next) => {
    const [pathname, query] = req.url!.split('?');
    if (pathname !== TOKEN_PATH) {
        next();
        return;
    }
    if (req.method !== 'GET') {
        json(res, 405, { error: 'Use GET' });
        return;
    }

    const params = new URLSearchParams(query);
    const identity = params.get('identity');
    const role = params.get('role');
    if (!identity || !role || !(role in ROLES)) {
        json(res, 400, { error: "identity and role are required (role: 'publisher' | 'controller')" });
        return;
    }

    const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_ROOM } = process.env;
    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_ROOM) {
        json(res, 503, { error: 'LiveKit credentials not configured (LIVEKIT_API_KEY / LIVEKIT_API_SECRET / LIVEKIT_ROOM)' });
        return;
    }

    try {
        const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity, ttl: '1h' });
        at.addGrant({ roomJoin: true, room: LIVEKIT_ROOM, ...ROLES[role as Role] });
        json(res, 200, { token: await at.toJwt(), room: LIVEKIT_ROOM, identity });
    } catch (err) {
        json(res, 500, { error: String(err) });
    }
};
