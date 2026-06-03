# TSN V1.5.29 — Danish Recovery Text

Denne version gør hele kontogendannelses- og kontosammenlægningsflowet dansk i brugerfladen og i de serverbeskeder, brugeren kan se.

## Ændret

- Kontogendannelsespanelets synlige tekster er nu danske.
- Kodefeltet bruger nu dansk label for gendannelseskode.
- Anmodningsfeltet bruger nu dansk label for anmodnings-ID.
- Admin-listen bruger danske statusser: Afventer, Godkendt, Afvist og Brugt.
- Sammenlægnings-popupen er fuldt oversat:
  - Dine to konti bliver sammenlagt nu.
  - Beskeder flyttes fra den nye konto til den gamle konto.
  - Stats overføres til den gamle konto.
  - Knappen hedder Fortsæt.
- Toasts, fejlbeskeder, notifikationer og aktivitetsfeed-tekster for gendannelse/sammenlægning er nu på dansk.

## Sikkerhed

Flowet viser stadig aldrig gamle adgangskoder. Brugeren får kun en admin-godkendt engangskode til at nulstille adgangskoden på den gamle konto, hvorefter kontiene kan sammenlægges.
