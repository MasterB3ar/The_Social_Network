# TSN V1.5.28 — Sikker kontogendannelse + sammenlægning

Gamle adgangskoder bliver aldrig vist. TSN bruger i stedet admin-godkendte engangskoder til nulstilling og en bekræftelses-popup til kontosammenlægning.

Flow:

- Den midlertidige konto sender en gendannelsesanmodning for det gamle brugernavn.
- Admin godkender eller afviser anmodningen.
- En godkendt anmodning opretter en engangs-gendannelseskode.
- Brugeren nulstiller adgangskoden til den gamle konto med koden.
- Når brugeren logger ind på den gamle konto, vises en sammenlægnings-popup.
- Fortsæt flytter data fra den midlertidige konto ind på den gamle konto og fjerner den midlertidige konto.
