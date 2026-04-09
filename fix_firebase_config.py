import json

config = {
  "projectId": "gen-lang-client-0015595827",
  "appId": "1:1065273995784:web:f661d7ee6a26c1f9a8d7bd",
  "apiKey": "AIzaSyCdrinGf7O6PxlbOlWalw00JHYihJ2Z2sU",
  "authDomain": "gen-lang-client-0015595827.firebaseapp.com",
  "firestoreDatabaseId": "ai-studio-6cef1134-a685-4ba6-afb7-20f486c58e52",
  "storageBucket": "gen-lang-client-0015595827.firebasestorage.app",
  "messagingSenderId": "1065273995784",
  "measurementId": "G-Q5JNYS3VJK"
}

with open('firebase-applet-config.json', 'w') as f:
    json.dump(config, f, indent=2)
print("Done")
