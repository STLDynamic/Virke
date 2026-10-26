# Virke — zapotrzebowanie na deski

Aplikacja do planowania materiału do produkcji palet. Układ, zielona kolorystyka,
szwedzki interfejs i sposób obsługi nawiązują do [Spik-R-knare](https://github.com/STLDynamic/Spik-R-knare).

## Uruchomienie

Wymagany Node.js 22 lub nowszy. Brak zewnętrznych zależności i etapu budowania.
W katalogu projektu:

```sh
npm start
```

Serwer używa portu 3000. Inny port: `PORT=3001 npm start`.
Testy obliczeń i walidacji: `npm test`.
Pliki można też opublikować jako stronę statyczną przez GitHub Pages:
Settings → Pages → Deploy from a branch → wybierz gałąź z kodem i katalog `/ (root)`.
Publikacja wymaga wcześniejszego zapisania kodu w repozytorium na GitHubie.

## Praca z aplikacją

1. **Brädor** — dodaj artykuł, nazwę, gatunek drewna, jakość i gotowe wymiary
   (grubość × szerokość × długość w pełnych mm). Różne gatunki i jakości
   zapisuj jako osobne artykuły. Artykuły mają unikalne nazwy.
2. **Produkter** — dodaj produkt i dowolną liczbę pozycji receptury.
   Każda pozycja wskazuje deskę i liczbę sztuk na jeden gotowy produkt.
   Ta sama deska może występować kilka razy; ilości są sumowane.
3. **Produktionsplan** — wpisz ilości produktów na poszczególne miesiące i kliknij
   **Spara produktionsplan**. Puste pole oznacza brak planu, a 0 zapisany brak
   produkcji. Niezapisane zmiany pozostają przy przełączaniu widoków i miesięcy.
   Przycisk **Återställ ändringar** odrzuca wszystkie takie zmiany.
4. **Materialbehov** — wybierz zakres miesięcy i procent zapasu na odpad (0–100%,
   z dokładnością do 0,1 punktu procentowego),
   a następnie wygeneruj raport. Raport obejmuje wszystkie zapisane produkty,
   niezależnie od wyszukiwania w katalogu. Pozycje bez planu nie wchodzą do sumy.
   Rozwiń **Visa beräkning**, aby sprawdzić produkty i miesiące składające się na wynik.
5. Eksportuj raport CSV lub użyj **Skriv ut / PDF** i zapisu PDF w przeglądarce.
   Regularnie eksportuj całą kopię JSON przez **Exportera säkerhetskopia**.
   **Importera** zastępuje bieżące dane dopiero po walidacji i potwierdzeniu.

Przykład: 1000 palet × 7 desek 22 × 100 × 1200 mm = 7000 desek,
8400 metrów bieżących i 18,48 m³ netto. Przy 5% zapasu: 7350 desek,
8820 metrów i 19,404 m³. Zapas naliczany jest po zsumowaniu zapotrzebowania
na artykuł w całym wybranym okresie, z zaokrągleniem liczby desek w górę.
Metry i m³ w raporcie dotyczą ilości z zapasem. CSV zawiera również ilości netto.

Zmiana receptury lub wymiarów deski przelicza wszystkie miesiące, także minione.
Dla innego wariantu użyj osobnego produktu/artykułu. Deski używanej w recepturze
nie można usunąć; usunięcie produktu usuwa także jego plany.

## Dane i zakres

Dane zapisują się w `localStorage` pod kluczem `virke.planning.v1`, osobno dla
adresu i profilu przeglądarki. Nie ma kont, wspólnej bazy ani synchronizacji.
Wyczyszczenie danych przeglądarki usuwa zapis. Przy zmianie adresu aplikacji
przenieś dane kopią JSON. Kopie Spik nie są kopiami Virke i nie są importowane.
Przy błędzie zapisu aplikacja pokazuje komunikat; przy uszkodzonym zapisie
wymaga przywrócenia poprawnej kopii i nie nadpisuje go automatycznie.

To plan zapotrzebowania na gotowe deski, bez stanów magazynowych, dostaw,
optymalizacji rozkroju, kosztów czy automatycznego składania zamówień.
Demonstracyjne dane można dodać wyłącznie do pustego katalogu.

## Pliki

- `index.html`, `src/style.css` — interfejs i responsywny wygląd.
- `src/app.js` — katalogi, plan, raporty, zapis i kopie.
- `src/model.js` — walidacja, agregacja, jednostki i eksport CSV.
- `server.js` — statyczny serwer udostępniający tylko pliki aplikacji.
- `tests/model.test.js` — testy obliczeń i danych.
