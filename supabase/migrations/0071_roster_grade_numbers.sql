-- ===========================================================================
-- Team Hub Platform — 0071 one vocabulary for grades
--
-- The grade list offered both "9th Grade" and "Freshman", which are the same
-- year. Two leaders with identical assignments could be tagged differently and
-- would then never group together on the roster — the one thing the tag exists
-- to do. The class names are gone; every grade is numbered.
--
-- Anyone already tagged with a class name is moved across. Without this their
-- grade would no longer match anything the app offers, so it would sort to the
-- bottom of its group as if untagged — quietly wrong, and tedious to find and
-- fix by hand.
-- ===========================================================================

update public.roster_people
   set grade = case lower(trim(grade))
                 when 'freshman'  then '9th Grade'
                 when 'sophomore' then '10th Grade'
                 when 'junior'    then '11th Grade'
                 when 'senior'    then '12th Grade'
                 else grade
               end
 where lower(trim(coalesce(grade, ''))) in ('freshman', 'sophomore', 'junior', 'senior');
