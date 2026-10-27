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

Raport grupuje elementy według **grubości × szerokości**, np. 16 × 75 i 22 × 100.
Długość, nazwa artykułu, gatunek i jakość nie tworzą oddzielnych grup w raporcie.
Długość nadal służy do obliczenia objętości elementu w recepturze.
Dotyczy to zarówno desek, jak i klocków: klocek 75 × 75 × 75 należy do grupy
75 × 75, a 75 × 100 × 100 do grupy 75 × 100.

Przykład: 1000 palet, każda z 8 deskami 16 × 75 × 1200 i 3 deskami
16 × 75 × 800, zużywa **14,4 m³ materiału 16 × 75**. Nie powstają dwa
wiersze raportu dla długości 1200 i 800. Dodatkowe 9 klocków 75 × 75 × 75
na każdą paletę to **3,796875 m³ materiału 75 × 75**.

Główne wartości to m³ netto i m³ z opcjonalnym procentowym zapasem.
Zapas jest narzutem na objętość netto; nie zaokrągla się go do całych desek.
Dla zakresu kilku miesięcy raport pokazuje też netto każdego miesiąca.
CSV zawiera wiersz na materiał i zaplanowany miesiąc oraz sumę okresu.
Wartości obliczane są przed zaokrągleniem do prezentacji; CSV zawiera 6 miejsc
po przecinku. Rozwinięte obliczenia zachowują artykuły, długości i produkty.
Istniejące dane oraz kopie JSON pozostają zgodne i nie wymagają migracji.

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
