# 🏐 Volley Stays

A shared planner for group accommodation across the beach volleyball tour.
Friends open one link, type their name, and add, rank, and track places to stay. Changes show up live on everyone's phone.

The app is plain HTML/CSS/JS (`index.html`, `app.js`, `style.css`) hosted free on GitHub Pages, with a free Supabase database.

## One-time setup: connect the shared database (about 10 minutes)

Until this is done the app runs in **demo mode**, where data is saved only on the device you're using.

### 1. Create a free Supabase project
1. Go to <https://supabase.com/dashboard> and sign in. If you don't have an account yet, choose **Continue with GitHub**.
2. Click **New project**.
3. Fill in:
   - **Name:** `volley-stays`
   - **Database password:** click **Generate a password**. You won't need it for this app, but save it in your password manager anyway.
   - **Region:** *Oceania (Sydney)*
   - Leave everything else as it is.
4. Click **Create new project**, then wait 1–2 minutes until the dashboard finishes setting up.

> The free plan allows 2 active projects. If you already have 2, pause or delete one first. Free projects pause after about a week with no visits. If that happens, open the dashboard and click **Restore**.

### 2. Create the tables
1. In the left sidebar, click **SQL Editor**, then **+ New query**.
2. Open [`schema.sql`](schema.sql), copy **everything** in it, and paste it into the editor.
3. Click **Run** (bottom right). You should see "Success. No rows returned".
4. (Optional check) Click **Table Editor** in the sidebar. You should see `events` with your 5 tour events.

### 3. Copy the two connection values
1. Click the **Connect** button at the top of the project page (or go to **Project Settings → API Keys / Data API**).
2. Copy these two values:
   - **Project URL**, which looks like `https://abcdefghijkl.supabase.co`
   - **Publishable key** (newer projects) or **anon public key** (older ones), which starts with `sb_publishable_` or `eyJ`.
   - ⚠️ Do **not** use the `secret` / `service_role` key.
3. Send both to Claude, or paste them into [`config.js`](config.js) yourself.

Both values are meant to be public. They let anyone with the link do exactly what the app does, and nothing more.

## Using it
- **Share the link** in your group chat. Each person types their name once per device.
- **+ Event** adds a tour stop. **Edit** on an event changes its dates or court location, or deletes it.
- **+ Add an option**: paste the listing link and fill in price, people, beds, distance, cancellation date, and notes. The price per person is worked out for you.
- **My ranking**: use ▲▼ to put your favourite at the top. **Group ranking** combines everyone's votes (your #1 gets the most points) and shows the 🏆 top pick.
- Change an option's **status** (Idea → Shortlisted → Booked → Paid). When it's set to Booked, it records who booked it.
- **Summary** has one row per event. It shows the booked option if there is one, otherwise the group's top pick. Free-cancellation deadlines in the next 14 days are highlighted.

## Privacy note
There are no passwords, so anyone who has the link can view and edit. Only share it with your group.
