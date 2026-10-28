/**
Name    : colsp_GetPermitPeriods
Date    : August 25, 2026
Author  : Ted Corpus
Purpose : Returns permit periods for the permit administration UI
**/
CREATE OR ALTER PROCEDURE [dbo].[colsp_GetPermitPeriods]
 @systemID int = 1
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
         [PeriodID]
        ,[Name]
        ,[StartDate]
        ,[EndDate]
        ,[BookingStartDate]
        ,[BookingEndDate]
        ,[TypeID]
    FROM [dbo].[PermitPeriods]
    WHERE [TypeID] = 1 OR [PeriodID] = 14
    ORDER BY [StartDate], [PeriodID];
END
GO